import { createHash, createHmac, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

const ISSUER = 'techmock-api';
const AUDIENCE = 'techmock-client';

export function createTokenService(config) {
  return {
    signAccess(userId) {
      return jwt.sign({}, config.jwtAccessSecret, {
        subject: userId, expiresIn: config.accessTtlSeconds, algorithm: 'HS256', issuer: ISSUER, audience: AUDIENCE,
      });
    },
    verifyAccess(token) {
      return jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
    },
    /** Opaque random refresh token; only an HMAC of it (keyed by JWT_REFRESH_SECRET) is stored. */
    newRefreshToken() {
      const token = randomBytes(48).toString('base64url');
      return { token, hash: this.hashRefresh(token) };
    },
    hashRefresh(token) {
      return createHmac('sha256', config.jwtRefreshSecret).update(token).digest('hex');
    },
    sha256: (s) => createHash('sha256').update(s).digest('hex'),
  };
}
