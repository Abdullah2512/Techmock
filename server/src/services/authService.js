import bcrypt from 'bcryptjs';
import { AppError, unauthorized } from '../errors.js';
import { usersRepo, tokensRepo } from '../repositories/users.js';

export function createAuthService({ db, config, tokens }) {
  // Used to equalise timing when the email is unknown so login does not reveal which emails exist.
  const dummyHash = bcrypt.hashSync('timing-equaliser-not-a-real-password', config.bcryptRounds);
  const refreshExpiry = () => new Date(Date.now() + config.refreshTtlDays * 86_400_000);

  async function issueSession(userId, q = db) {
    const refresh = tokens.newRefreshToken();
    await tokensRepo(q).create(userId, refresh.hash, refreshExpiry());
    return { accessToken: tokens.signAccess(userId), refreshToken: refresh.token, expiresIn: config.accessTtlSeconds };
  }

  return {
    async register({ name, email, password }) {
      const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
      try {
        return await db.transaction(async (tx) => {
          const user = await usersRepo(tx).create({ name, email, passwordHash });
          return { user, ...(await issueSession(user.id, tx)) };
        });
      } catch (err) {
        if (err?.code === '23505') {
          throw new AppError(409, 'REGISTRATION_FAILED', 'Could not create an account with these details. If you already registered, sign in instead.');
        }
        throw err;
      }
    },

    async login({ email, password }) {
      const found = await usersRepo(db).findAuthByEmail(email);
      const ok = await bcrypt.compare(password, found?.passwordHash ?? dummyHash);
      if (!found || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
      const profile = await usersRepo(db).findById(found.id);
      return { user: profile.user, ...(await issueSession(found.id)) };
    },

    /** Rotating refresh: the presented token is revoked and replaced. Reuse of a revoked token revokes all sessions. */
    async refresh(refreshToken) {
      if (!refreshToken) throw unauthorized('Session expired. Please sign in again.');
      const hash = tokens.hashRefresh(refreshToken);
      const row = await tokensRepo(db).find(hash);
      if (!row) throw unauthorized('Session expired. Please sign in again.');
      if (row.revokedAt) {
        await tokensRepo(db).revokeAllForUser(row.userId);
        throw unauthorized('Session expired. Please sign in again.');
      }
      if (new Date(row.expiresAt) <= new Date()) throw unauthorized('Session expired. Please sign in again.');
      const won = await tokensRepo(db).revokeIfActive(hash);
      if (!won) throw unauthorized('Session expired. Please sign in again.');
      const profile = await usersRepo(db).findById(row.userId);
      if (!profile) throw unauthorized('Session expired. Please sign in again.');
      return { user: profile.user, ...(await issueSession(row.userId)) };
    },

    async logout(refreshToken) {
      if (refreshToken) await tokensRepo(db).revokeIfActive(tokens.hashRefresh(refreshToken));
    },

    async getProfile(userId) {
      const p = await usersRepo(db).findById(userId);
      if (!p) throw unauthorized();
      return p;
    },

    async updateProfile(userId, { name, theme, preferredLanguage }) {
      await db.transaction(async (tx) => {
        if (name !== undefined) await usersRepo(tx).updateName(userId, name);
        if (theme !== undefined || preferredLanguage !== undefined) {
          await usersRepo(tx).upsertPreferences(userId, { theme, preferredLanguage });
        }
      });
      return this.getProfile(userId);
    },
  };
}
