const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);

export const mapSession = (r) => r && ({
  id: r.id, topic: r.topic, difficulty: r.difficulty, mode: r.mode, durationMinutes: r.duration_minutes,
  status: r.status, dataSource: r.data_source, startedAt: iso(r.started_at), completedAt: iso(r.completed_at),
  createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});
const mapQuestion = (r) => ({
  id: r.id, sequenceNumber: r.sequence_number, type: r.question_type, prompt: r.prompt, metadata: r.metadata, createdAt: iso(r.created_at),
});
const mapAnswer = (r) => ({
  id: r.id, questionId: r.question_id, answerText: r.answer_text, sourceCode: r.source_code, language: r.language,
  executionMetadata: r.execution_metadata, submittedAt: iso(r.submitted_at),
});

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export const interviewsRepo = (q) => ({
  async createSession(userId, s) {
    const { rows } = await q.query(
      `INSERT INTO interview_sessions (user_id, topic, difficulty, mode, duration_minutes, data_source)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [userId, s.topic, s.difficulty, s.mode, s.durationMinutes, s.dataSource],
    );
    return mapSession(rows[0]);
  },
  async addQuestion(sessionId, { type, prompt, metadata }) {
    const { rows } = await q.query(
      `INSERT INTO interview_questions (session_id, sequence_number, question_type, prompt, metadata)
       SELECT $1, COALESCE(MAX(sequence_number), 0) + 1, $2, $3, $4::jsonb FROM interview_questions WHERE session_id = $1
       RETURNING *`,
      [sessionId, type, prompt, JSON.stringify(metadata ?? {})],
    );
    return mapQuestion(rows[0]);
  },
  /** Ownership is enforced in SQL: a session id alone never grants access. */
  async getForUser(id, userId) {
    const { rows } = await q.query('SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2', [id, userId]);
    return mapSession(rows[0]) ?? null;
  },
  async questions(sessionId) {
    const { rows } = await q.query('SELECT * FROM interview_questions WHERE session_id = $1 ORDER BY sequence_number', [sessionId]);
    return rows.map(mapQuestion);
  },
  async answers(sessionId) {
    const { rows } = await q.query('SELECT * FROM interview_answers WHERE session_id = $1 ORDER BY submitted_at', [sessionId]);
    return rows.map(mapAnswer);
  },
  async upsertAnswer(sessionId, questionId, { answerText, sourceCode, language }) {
    const { rows } = await q.query(
      `INSERT INTO interview_answers (session_id, question_id, answer_text, source_code, language)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (question_id) DO UPDATE SET
         answer_text = COALESCE($3, interview_answers.answer_text),
         source_code = COALESCE($4, interview_answers.source_code),
         language = COALESCE($5, interview_answers.language),
         submitted_at = now()
       RETURNING *`,
      [sessionId, questionId, answerText ?? null, sourceCode ?? null, language ?? null],
    );
    return mapAnswer(rows[0]);
  },
  async attachExecutionMetadata(questionId, metadata) {
    await q.query('UPDATE interview_answers SET execution_metadata = $2::jsonb WHERE question_id = $1', [questionId, JSON.stringify(metadata)]);
  },
  async insertRun(sessionId, questionId, { language, codeSha256, result }) {
    await q.query(
      'INSERT INTO code_runs (session_id, question_id, language, code_sha256, result) VALUES ($1,$2,$3,$4,$5::jsonb)',
      [sessionId, questionId, language, codeSha256, JSON.stringify(result)],
    );
  },
  async recentRuns(sessionId, limit = 5) {
    const { rows } = await q.query(
      'SELECT id, question_id, language, code_sha256, result, created_at FROM code_runs WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2',
      [sessionId, limit],
    );
    return rows.map((r) => ({ id: r.id, questionId: r.question_id, language: r.language, codeSha256: r.code_sha256, result: r.result, createdAt: iso(r.created_at) }));
  },
  /**
   * Atomic compare-and-set status change. Returns the updated session, or null if the session is not
   * owned by the user or is not currently in one of `allowedFrom` (so concurrent/duplicate calls lose cleanly).
   */
  async transition(id, userId, to, allowedFrom) {
    const { rows } = await q.query(
      `UPDATE interview_sessions SET status = $3, updated_at = now(),
         started_at = CASE WHEN $3 = 'in_progress' THEN COALESCE(started_at, now()) ELSE started_at END,
         completed_at = CASE WHEN $3 = 'completed' THEN now() ELSE completed_at END
       WHERE id = $1 AND user_id = $2 AND status = ANY($4::text[]) RETURNING *`,
      [id, userId, to, allowedFrom],
    );
    return mapSession(rows[0]) ?? null;
  },
  async deleteForUser(id, userId) {
    const { rowCount } = await q.query('DELETE FROM interview_sessions WHERE id = $1 AND user_id = $2', [id, userId]);
    return rowCount === 1;
  },
  async list(userId, f) {
    const where = ['s.user_id = $1'];
    const params = [userId];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (f.status) add('s.status = ?', f.status);
    if (f.mode) add('s.mode = ?', f.mode);
    if (f.topic) add('s.topic = ?', f.topic);
    if (f.q) {
      params.push(`%${escapeLike(f.q)}%`);
      const n = params.length;
      where.push(`(s.topic ILIKE $${n} OR EXISTS (SELECT 1 FROM interview_questions iq WHERE iq.session_id = s.id AND iq.prompt ILIKE $${n}))`);
    }
    const sortCol = { created_at: 's.created_at', score: 'r.total_score', topic: 's.topic' }[f.sort];
    const dir = f.order === 'asc' ? 'ASC' : 'DESC';
    const base = `FROM interview_sessions s LEFT JOIN evaluation_reports r ON r.session_id = s.id WHERE ${where.join(' AND ')}`;
    const total = (await q.query(`SELECT COUNT(*) AS n ${base}`, params)).rows[0].n;
    const { rows } = await q.query(
      `SELECT s.*, r.total_score, r.is_demo,
         (SELECT metadata->>'title' FROM interview_questions iq WHERE iq.session_id = s.id ORDER BY sequence_number LIMIT 1) AS title
       ${base} ORDER BY ${sortCol} ${dir} NULLS LAST, s.created_at DESC, s.id
       LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`,
      params,
    );
    return {
      total,
      items: rows.map((r) => ({ ...mapSession(r), title: r.title || null, totalScore: r.total_score ?? null, isDemo: r.is_demo ?? null })),
    };
  },
});
