import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { csrfGuard } from '../middleware/csrf.js';
import { registerSchema, loginSchema, profilePatchSchema } from '../schemas/auth.js';
import {
  idParams, createInterviewSchema, listInterviewsQuery, answerSchema, runSchema, submitSchema,
} from '../schemas/interview.js';

const COOKIE = 'tm_refresh';

export function buildRoutes({ config, db, ai, authService, interviewService, dashboardService, tokenService, limiters, logger }) {
  const api = Router();
  const auth = requireAuth(tokenService);
  const csrf = csrfGuard(config.clientOrigins);

  const cookieOpts = () => ({
    httpOnly: true, secure: config.isProd, sameSite: config.cookieSameSite, path: '/api/auth',
  });
  const setRefreshCookie = (res, token) =>
    res.cookie(COOKIE, token, { ...cookieOpts(), maxAge: config.refreshTtlDays * 86_400_000 });
  const sessionBody = (s) => ({ user: s.user, accessToken: s.accessToken, expiresIn: s.expiresIn });

  api.use(limiters.general);

  // ---- Health (public, no secrets) ----
  api.get('/health', async (_req, res) => {
    let database = 'up';
    try { await Promise.race([db.query('SELECT 1'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500))]); }
    catch { database = 'down'; }
    let aiState = { status: 'down', mode: null };
    try { const h = await ai.health(); aiState = { status: 'up', mode: h.mode ?? null }; } catch { /* reported as down */ }
    res.status(database === 'up' ? 200 : 503).json({ status: database === 'up' ? 'ok' : 'degraded', time: new Date().toISOString(), database, ai: aiState });
  });

  // ---- Auth ----
  api.post('/auth/register', limiters.register, validate(registerSchema), async (req, res) => {
    const s = await authService.register(req.valid.body);
    setRefreshCookie(res, s.refreshToken);
    res.status(201).json(sessionBody(s));
  });
  api.post('/auth/login', limiters.login, validate(loginSchema), async (req, res) => {
    const s = await authService.login(req.valid.body);
    setRefreshCookie(res, s.refreshToken);
    res.json(sessionBody(s));
  });
  api.post('/auth/refresh', csrf, async (req, res) => {
    try {
      const s = await authService.refresh(req.cookies?.[COOKIE]);
      setRefreshCookie(res, s.refreshToken);
      res.json(sessionBody(s));
    } catch (err) {
      res.clearCookie(COOKIE, cookieOpts());
      throw err;
    }
  });
  api.post('/auth/logout', csrf, async (req, res) => {
    await authService.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, cookieOpts());
    res.status(204).end();
  });

  // ---- Profile / dashboard ----
  api.get('/profile', auth, async (req, res) => res.json(await authService.getProfile(req.user.id)));
  api.patch('/profile', auth, validate(profilePatchSchema), async (req, res) =>
    res.json(await authService.updateProfile(req.user.id, req.valid.body)));
  api.get('/dashboard', auth, async (req, res) => res.json(await dashboardService.get(req.user.id)));

  // ---- Interviews ----
  api.post('/interviews', auth, limiters.ai, validate(createInterviewSchema), async (req, res) =>
    res.status(201).json(await interviewService.create(req.user.id, req.valid.body, req.id)));
  api.get('/interviews', auth, validate(listInterviewsQuery, 'query'), async (req, res) => {
    const f = req.valid.query;
    const { items, total } = await interviewService.list(req.user.id, f);
    res.json({ items, page: f.page, pageSize: f.pageSize, total, totalPages: Math.max(1, Math.ceil(total / f.pageSize)) });
  });
  api.get('/interviews/:id', auth, validate(idParams, 'params'), async (req, res) =>
    res.json(await interviewService.get(req.params.id, req.user.id)));
  api.delete('/interviews/:id', auth, validate(idParams, 'params'), async (req, res) => {
    await interviewService.remove(req.params.id, req.user.id);
    res.status(204).end();
  });
  api.post('/interviews/:id/answers', auth, limiters.ai, validate(idParams, 'params'), validate(answerSchema), async (req, res) =>
    res.json(await interviewService.saveAnswer(req.params.id, req.user.id, req.valid.body, req.id)));
  api.post('/interviews/:id/run', auth, limiters.run, validate(idParams, 'params'), validate(runSchema), async (req, res) =>
    res.json(await interviewService.run(req.params.id, req.user.id, req.valid.body, req.id)));
  api.post('/interviews/:id/submit', auth, limiters.ai, validate(idParams, 'params'), validate(submitSchema), async (req, res) => {
    const out = await interviewService.submit(req.params.id, req.user.id, req.valid.body, req.id);
    res.status(200).json(out);
  });
  api.post('/interviews/:id/cancel', auth, validate(idParams, 'params'), async (req, res) =>
    res.json({ session: await interviewService.cancel(req.params.id, req.user.id) }));
  api.get('/interviews/:id/report', auth, validate(idParams, 'params'), async (req, res) =>
    res.json({ report: await interviewService.getReport(req.params.id, req.user.id) }));

  return api;
}
