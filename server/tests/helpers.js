import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { createPgliteDb } from '../src/db/pglite.js';
import { runMigrations } from '../src/db/migrate.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export const testEnv = {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40),
  AI_SERVICE_TOKEN: 't'.repeat(20), GEMINI_API_KEY: 'test-gemini-key', BCRYPT_ROUNDS: '4', RATE_LIMIT_ENABLED: 'false', CLIENT_ORIGIN: 'http://localhost:5173',
};

export function validEvaluation(mode = 'coding', source = 'live') {
  const rubric = mode === 'coding'
    ? [['Correctness', 40, 30], ['Algorithmic efficiency', 20, 15], ['Code quality and readability', 15, 10], ['Edge-case handling', 15, 10], ['Explanation and reasoning', 10, 8]]
    : [['Correctness', 30, 24], ['Depth', 25, 18], ['Reasoning', 20, 15], ['Clarity', 15, 12], ['Practical engineering knowledge', 10, 7]];
  const cats = rubric.map(([category, max_score, score]) => ({ category, score, max_score, evidence: 'Quoted evidence from the answer.' }));
  return {
    source, total_score: cats.reduce((s, c) => s + c.score, 0), category_scores: cats,
    strengths: ['Clear approach'], weaknesses: ['Missing edge cases'], suggestions: ['Add tests'],
    explanation: 'Because of X.', interviewer_summary: 'Solid attempt.',
    rubric: rubric.map(([category, max_points]) => ({ category, max_points })),
    execution_status: null, complexity_analysis: null, model: 'fake', prompt_version: 'test-v1',
  };
}

export function fakeAi() {
  const ai = {
    calls: [], source: 'live', errors: {}, overrides: {},
    async _do(name, body, make) {
      ai.calls.push({ name, body });
      if (ai.errors[name]) throw ai.errors[name];
      if (ai.overrides[name]) return ai.overrides[name](body);
      return make(body);
    },
    generateQuestion: (b) => ai._do('generateQuestion', b, (body) => ({
      source: ai.source, prompt: `Solve a ${body.difficulty} ${body.topic} problem${body.follow_up ? ' (follow-up)' : ''}.`,
      metadata: { title: body.follow_up ? 'Follow-up' : 'Two Sum', constraints: ['1 <= n <= 1e5'], examples: [{ input: '[1,2]', output: '3' }], starter_code: { javascript: '// start' } },
      model: 'fake-model', prompt_version: 'q-v1',
    })),
    evaluateAnswer: (b) => ai._do('evaluateAnswer', b, () => validEvaluation('qa', ai.source)),
    evaluateCode: (b) => ai._do('evaluateCode', b, () => validEvaluation('coding', ai.source)),
    executeCode: (b) => ai._do('executeCode', b, () => ({
      source: ai.source, available: ai.source === 'live', status: { id: 3, description: 'Accepted' },
      stdout: 'hello\n', stderr: '', compile_output: '', message: null, time: '0.012', memory: 3000, token: 'tok',
    })),
    health: async () => ({ status: 'ok', mode: ai.source }),
  };
  return ai;
}

export async function makeApp({ env = {}, db: dbOverride } = {}) {
  const db = dbOverride ?? (await createPgliteDb());
  if (!dbOverride) await runMigrations(db, migrationsDir);
  const { overrides, ...envRest } = env;
  const config = { ...loadConfig({ ...testEnv, ...envRest }), ...(overrides ?? {}) };
  const ai = fakeAi();
  const logs = [];
  const logger = createLogger({ level: 'debug', sink: (l) => logs.push(l) });
  const app = createApp({ config, db, ai, logger });
  return { app, db, ai, config, logs, close: () => db.close() };
}

let counter = 0;
export async function registerUser(app, overrides = {}) {
  counter += 1;
  const body = { name: `User ${counter}`, email: `user${counter}_${Date.now()}@example.com`, password: 'correct-horse-battery', ...overrides };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('tm_refresh='));
  return { token: res.body.accessToken, user: res.body.user, body, cookie, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}

export const createInterview = (app, u, over = {}) =>
  request(app).post('/api/interviews').set(u.auth).send({ topic: 'dsa', difficulty: 'intermediate', mode: 'coding', durationMinutes: 30, ...over });
