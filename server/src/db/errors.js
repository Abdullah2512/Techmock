import { AppError } from '../errors.js';

const CONNECTION_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE',
  '57P01', '57P02', '57P03', '53300', '08000', '08001', '08003', '08004', '08006',
]);

export function isConnectionError(err) {
  if (!err) return false;
  if (CONNECTION_CODES.has(err.code)) return true;
  return /connection terminated|timeout exceeded when trying to connect|Connection terminated unexpectedly/i.test(
    err.message ?? '',
  );
}

/** Convert low-level connection failures to a safe 503; everything else is rethrown untouched. */
export function wrapDbError(err) {
  if (err instanceof AppError) return err;
  if (isConnectionError(err)) {
    const e = new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is temporarily unavailable. Please try again.');
    e.cause = err;
    return e;
  }
  return err;
}
