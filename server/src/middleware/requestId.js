import { randomUUID } from 'node:crypto';

export function requestId(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[A-Za-z0-9_-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
