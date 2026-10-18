export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required.') =>
  new AppError(401, 'UNAUTHENTICATED', message);
export const notFound = (message = 'Resource not found.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (code, message) => new AppError(409, code, message);
