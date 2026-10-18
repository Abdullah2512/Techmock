import { AppError } from '../errors.js';

export const notFoundHandler = (req, _res, next) =>
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found.`));

export const errorHandler = (logger) => (err, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong on our side. Please try again.';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err?.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'Request body is not valid JSON.';
  } else if (err?.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body is too large.';
  }

  if (status >= 500) {
    // Full detail goes to server logs only (never to the client).
    logger.error('request_failed', {
      requestId: req.id, code, status,
      error: err?.message, cause: err?.cause?.message, stack: err?.stack?.split('\n').slice(0, 6).join(' | '),
    });
  } else {
    logger.debug('request_rejected', { requestId: req.id, code, status });
  }

  if (res.headersSent) return;
  const body = { error: { code, message, requestId: req.id } };
  if (details) body.error.details = details;
  res.status(status).json(body);
};
