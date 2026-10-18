import { unauthorized } from '../errors.js';

export function requireAuth(tokenService) {
  return (req, _res, next) => {
    const header = req.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return next(unauthorized());
    try {
      const claims = tokenService.verifyAccess(match[1]);
      req.user = { id: claims.sub };
      next();
    } catch {
      next(unauthorized('Invalid or expired token.'));
    }
  };
}
