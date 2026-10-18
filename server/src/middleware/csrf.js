import { AppError } from '../errors.js';

/**
 * CSRF defence for the cookie-authenticated endpoints (refresh/logout):
 * 1) a custom header is required, which browsers only allow via CORS preflight (allowed origins only);
 * 2) if an Origin header is present it must be an allowed origin.
 */
export const csrfGuard = (allowedOrigins) => (req, _res, next) => {
  const origin = req.get('origin');
  if (req.get('x-requested-with') !== 'XMLHttpRequest' || (origin && !allowedOrigins.includes(origin))) {
    return next(new AppError(403, 'CSRF_REJECTED', 'Request rejected.'));
  }
  next();
};
