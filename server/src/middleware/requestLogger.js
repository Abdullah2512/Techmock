// Logs request metadata only: no bodies, no query strings, no auth headers (FR-20, SEC-09).
export function requestLogger(logger) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info('request', {
        requestId: req.id,
        method: req.method,
        path: (req.baseUrl + (req.route?.path ?? '') || req.originalUrl.split('?')[0]).slice(0, 200),
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        userId: req.user?.id,
      });
    });
    next();
  };
}
