import { AppError, badRequest, conflict, notFound } from '../errors.js';
import { MAX_FOLLOW_UPS, SESSION_STATUS as S, defaultLanguage, languagesForTopic, REPORT_DISCLAIMER } from '../domain/constants.js';
import { statusesAllowing } from '../domain/stateMachine.js';
import { interviewsRepo } from '../repositories/interviews.js';
import { reportsRepo } from '../repositories/reports.js';
import { usersRepo } from '../repositories/users.js';
import { aiQuestionSchema, aiEvaluationSchema, aiExecutionSchema } from '../schemas/ai.js';

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

function parseAi(schema, data, what) {
  const r = schema.safeParse(data);
  if (!r.success) throw new AppError(502, 'AI_INVALID_RESPONSE', `The AI service returned an invalid ${what}. Nothing was saved.`);
  return r.data;
}

export function createInterviewService({ db, ai, tokens, logger }) {
  const repos = (q = db) => ({ iv: interviewsRepo(q), rp: reportsRepo(q), us: usersRepo(q) });

  /** Load a session owned by the user or throw 404 (identical response for "missing" and "someone else's"). */
  async function owned(id, userId, q = db) {
    const s = await interviewsRepo(q).getForUser(id, userId);
    if (!s) throw notFound('Interview not found.');
    return s;
  }
  const assertOpen = (s) => {
    if (![S.CREATED, S.IN_PROGRESS].includes(s.status)) {
      throw conflict('INVALID_STATE', `This interview is ${s.status} and can no longer be changed.`);
    }
  };
  const history = (questions, answers) =>
    questions.map((q) => {
      const a = answers.find((x) => x.questionId === q.id);
      return { question: q.prompt, answer: a?.answerText ?? '', ...(a?.sourceCode ? { code: a.sourceCode } : {}) };
    });

  async function persistAnswer(q, session, questions, body) {
    const { iv } = repos(q);
    const primary = questions[0];
    const target = body.questionId ? questions.find((x) => x.id === body.questionId) : questions[questions.length - 1];
    if (!target) throw badRequest('INVALID_QUESTION', 'That question does not belong to this interview.');
    if (session.mode === 'coding' && body.sourceCode !== undefined) {
      await iv.upsertAnswer(session.id, primary.id, {
        sourceCode: body.sourceCode, language: body.language,
        answerText: target.id === primary.id ? body.answerText : undefined,
      });
      if (target.id !== primary.id && body.answerText !== undefined) await iv.upsertAnswer(session.id, target.id, { answerText: body.answerText });
      return target;
    }
    if (body.answerText !== undefined) await iv.upsertAnswer(session.id, target.id, { answerText: body.answerText });
    return target;
  }

  async function detail(session) {
    const { iv } = repos();
    const [questions, answers, runs] = await Promise.all([iv.questions(session.id), iv.answers(session.id), iv.recentRuns(session.id, 10)]);
    return {
      session,
      questions,
      answers,
      runs: runs.map((r) => ({ id: r.id, language: r.language, status: r.result?.status, time: r.result?.time ?? null, createdAt: r.createdAt })),
      languages: languagesForTopic(session.topic),
      followUpsRemaining: Math.max(0, MAX_FOLLOW_UPS - questions.filter((x) => x.type === 'follow_up').length),
    };
  }

  return {
    async create(userId, input, requestId) {
      const prefs = (await repos().us.findById(userId))?.preferences;
      const generated = parseAi(aiQuestionSchema, await ai.generateQuestion({
        topic: input.topic, difficulty: input.difficulty, mode: input.mode, duration_minutes: input.durationMinutes,
        language: input.mode === 'coding' ? defaultLanguage(input.topic, prefs?.preferredLanguage) : null,
        languages: input.mode === 'coding' ? languagesForTopic(input.topic) : [],
        follow_up: false, history: [],
      }, requestId), 'question');
      // Nothing is persisted until generation succeeded: no half-created sessions.
      const session = await db.transaction(async (tx) => {
        const { iv } = repos(tx);
        const s = await iv.createSession(userId, { ...input, dataSource: generated.source });
        await iv.addQuestion(s.id, { type: 'primary', prompt: generated.prompt, metadata: { ...generated.metadata, model: generated.model ?? null, promptVersion: generated.prompt_version ?? null } });
        return s;
      });
      return detail(session);
    },

    list: (userId, filters) => repos().iv.list(userId, filters),

    async get(id, userId) {
      return detail(await owned(id, userId));
    },

    async saveAnswer(id, userId, body, requestId) {
      let session = await owned(id, userId);
      assertOpen(session);
      if (session.status === S.CREATED) session = (await repos().iv.transition(id, userId, S.IN_PROGRESS, statusesAllowing(S.IN_PROGRESS))) ?? await owned(id, userId);
      assertOpen(session);
      const questions = await repos().iv.questions(id);
      const target = await db.transaction((tx) => persistAnswer(tx, session, questions, body));
      let followUp = null;
      if (body.requestFollowUp) {
        const answers = await repos().iv.answers(id);
        const answered = answers.find((a) => a.questionId === target.id);
        if (!nonEmpty(answered?.answerText) && !nonEmpty(answered?.sourceCode)) {
          throw badRequest('ANSWER_REQUIRED', 'Write an answer before requesting a follow-up question.');
        }
        if (questions.filter((x) => x.type === 'follow_up').length >= MAX_FOLLOW_UPS) {
          throw conflict('FOLLOW_UP_LIMIT', `A maximum of ${MAX_FOLLOW_UPS} follow-up questions is allowed.`);
        }
        const generated = parseAi(aiQuestionSchema, await ai.generateQuestion({
          topic: session.topic, difficulty: session.difficulty, mode: session.mode, duration_minutes: session.durationMinutes,
          language: null, languages: [], follow_up: true, history: history(questions, answers),
        }, requestId), 'follow-up question');
        if (generated.source !== session.dataSource) throw new AppError(409, 'AI_MODE_MISMATCH', 'The AI service mode changed during this interview. Start a new interview.');
        // Re-check state: the interview may have been submitted/cancelled while the AI call was running.
        const fresh = await owned(id, userId);
        assertOpen(fresh);
        followUp = await repos().iv.addQuestion(id, { type: 'follow_up', prompt: generated.prompt, metadata: { ...generated.metadata, model: generated.model ?? null } });
      }
      const answers = await repos().iv.answers(id);
      return { answers, followUp, followUpsRemaining: Math.max(0, MAX_FOLLOW_UPS - (await repos().iv.questions(id)).filter((x) => x.type === 'follow_up').length) };
    },

    async run(id, userId, { questionId, sourceCode, language, stdin }, requestId) {
      let session = await owned(id, userId);
      if (session.mode !== 'coding') throw conflict('NOT_CODING_MODE', 'Code execution is only available in coding interviews.');
      assertOpen(session);
      const questions = await repos().iv.questions(id);
      const primary = questions[0];
      if (questionId && !questions.some((q) => q.id === questionId)) throw badRequest('INVALID_QUESTION', 'That question does not belong to this interview.');
      const result = parseAi(aiExecutionSchema, await ai.executeCode({ language, source_code: sourceCode, stdin: stdin ?? '' }, requestId), 'execution result');
      if (result.source !== session.dataSource) throw new AppError(409, 'AI_MODE_MISMATCH', 'The AI service mode changed during this interview. Start a new interview.');
      if (session.status === S.CREATED) await repos().iv.transition(id, userId, S.IN_PROGRESS, statusesAllowing(S.IN_PROGRESS));
      if (result.source === 'live' && result.available) {
        // Server-side record of what really ran; evaluation later uses this, not client claims.
        await repos().iv.insertRun(id, primary.id, {
          language, codeSha256: tokens.sha256(sourceCode),
          result: { status: result.status, time: result.time ?? null, memory: result.memory ?? null, stdout: (result.stdout ?? '').slice(0, 4000), stderr: (result.stderr ?? '').slice(0, 2000), compile_output: (result.compile_output ?? '').slice(0, 2000) },
        });
      }
      return { result };
    },

    async submit(id, userId, body, requestId) {
      let session = await owned(id, userId);
      if (session.status === S.COMPLETED) return { report: await this._report(session), alreadyCompleted: true };
      if (session.status === S.CANCELLED) throw conflict('INVALID_STATE', 'This interview was cancelled.');
      if (session.status === S.SUBMITTED) throw conflict('SUBMISSION_IN_PROGRESS', 'This interview is already being evaluated. Please wait a moment.');

      const { iv, rp } = repos();
      const questions = await iv.questions(id);
      if (session.mode === 'coding' && body.sourceCode !== undefined && !nonEmpty(body.sourceCode)) throw badRequest('CODE_REQUIRED', 'Write some code before submitting.');
      // Persist the final answer first so user input survives any later failure (NFR-05).
      await db.transaction((tx) => persistAnswer(tx, session, questions, body));
      const answers = await iv.answers(id);
      const primaryAnswer = answers.find((a) => a.questionId === questions[0].id);
      if (session.mode === 'coding' && !nonEmpty(primaryAnswer?.sourceCode)) throw badRequest('CODE_REQUIRED', 'Write some code before submitting.');
      if (session.mode === 'qa' && !answers.some((a) => nonEmpty(a.answerText))) throw badRequest('ANSWER_REQUIRED', 'Write an answer before submitting.');

      // Atomic claim: only one caller can move the session to `submitted`.
      const claimed = await iv.transition(id, userId, S.SUBMITTED, statusesAllowing(S.SUBMITTED));
      if (!claimed) {
        session = await owned(id, userId);
        if (session.status === S.COMPLETED) return { report: await this._report(session), alreadyCompleted: true };
        throw conflict(session.status === S.SUBMITTED ? 'SUBMISSION_IN_PROGRESS' : 'INVALID_STATE', 'This interview can no longer be submitted.');
      }

      try {
        const transcript = history(questions, answers);
        let evaluation;
        if (session.mode === 'coding') {
          const runs = await iv.recentRuns(id, 5);
          const codeHash = tokens.sha256(primaryAnswer.sourceCode);
          evaluation = await ai.evaluateCode({
            topic: session.topic, difficulty: session.difficulty, language: primaryAnswer.language ?? 'javascript',
            question: { prompt: questions[0].prompt, title: questions[0].metadata?.title ?? '', constraints: questions[0].metadata?.constraints ?? [], examples: questions[0].metadata?.examples ?? [] },
            source_code: primaryAnswer.sourceCode, explanation: primaryAnswer.answerText ?? '', transcript: transcript.slice(1),
            executions: runs.map((r) => ({ ...r.result, language: r.language, matches_submitted_code: r.codeSha256 === codeHash, ran_at: r.createdAt })),
          }, requestId);
        } else {
          evaluation = await ai.evaluateAnswer({ topic: session.topic, difficulty: session.difficulty, transcript }, requestId);
        }
        const ev = parseAi(aiEvaluationSchema, evaluation, 'evaluation');
        if (ev.source !== session.dataSource) throw new AppError(409, 'AI_MODE_MISMATCH', 'The AI service mode changed during this interview. Start a new interview.');

        const created = await db.transaction(async (tx) => {
          const t = repos(tx);
          const report = await t.rp.createIfAbsent(id, {
            totalScore: Math.round(ev.total_score), categoryScores: ev.category_scores, strengths: ev.strengths, weaknesses: ev.weaknesses,
            suggestions: ev.suggestions, summary: ev.interviewer_summary, isDemo: ev.source === 'demo',
            details: { explanation: ev.explanation, rubric: ev.rubric, executionStatus: ev.execution_status ?? null, complexityAnalysis: ev.complexity_analysis ?? null, model: ev.model ?? null, promptVersion: ev.prompt_version ?? null },
          });
          const done = await t.iv.transition(id, userId, S.COMPLETED, statusesAllowing(S.COMPLETED));
          if (!done) throw new AppError(409, 'INVALID_STATE', 'The interview state changed during evaluation.');
          return report;
        });
        const finalSession = await owned(id, userId);
        return { report: await this._report(finalSession, created), alreadyCompleted: false };
      } catch (err) {
        // Evaluation failed: release the claim so the user can retry. No report was saved.
        const rolled = await iv.transition(id, userId, S.IN_PROGRESS, statusesAllowing(S.IN_PROGRESS)).catch(() => null);
        logger.warn('submit_failed_rolled_back', { requestId, sessionId: id, code: err?.code, rolledBack: Boolean(rolled) });
        throw err;
      }
    },

    async _report(session, existing) {
      const { iv, rp } = repos();
      const report = existing ?? (await rp.getBySession(session.id));
      if (!report) throw notFound('Report not found.');
      const [questions, answers] = await Promise.all([iv.questions(session.id), iv.answers(session.id)]);
      return { ...report, session, questions, answers, disclaimer: REPORT_DISCLAIMER };
    },

    async getReport(id, userId) {
      const session = await owned(id, userId);
      if (session.status !== S.COMPLETED) throw new AppError(404, 'REPORT_NOT_FOUND', 'No report exists for this interview yet.');
      return this._report(session);
    },

    async cancel(id, userId) {
      const s = await owned(id, userId);
      const updated = await repos().iv.transition(id, userId, S.CANCELLED, statusesAllowing(S.CANCELLED));
      if (!updated) throw conflict('INVALID_STATE', `A ${s.status} interview cannot be cancelled.`);
      return updated;
    },

    async remove(id, userId) {
      if (!(await repos().iv.deleteForUser(id, userId))) throw notFound('Interview not found.');
    },
  };
}
