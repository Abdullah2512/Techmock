import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const passthrough = (_req, _res, next) => next();

export function createLimiters(config) {
  if (!config.rateLimitEnabled) {
    return { general: passthrough, login: passthrough, register: passthrough, ai: passthrough, run: passthrough };
  }
  const o = config.rateLimitOverrides ?? {};
  const make = (windowMs, limit, byUser = false) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (req) => (byUser && req.user?.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip ?? '')),
      handler: (req, res) =>
        res.status(429).json({
          error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again shortly.', requestId: req.id },
        }),
    });
  return {
    general: make(60_000, o.general ?? 300),
    login: make(15 * 60_000, o.login ?? 10),
    register: make(60 * 60_000, o.register ?? 10),
    ai: make(10 * 60_000, o.ai ?? 30, true),
    run: make(60_000, o.run ?? 30, true),
  };
}
