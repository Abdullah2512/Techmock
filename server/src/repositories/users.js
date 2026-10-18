const mapUser = (r) => r && ({ id: r.id, name: r.name, email: r.email, role: r.role, createdAt: r.created_at, updatedAt: r.updated_at });
const mapPrefs = (r) => r && ({ theme: r.theme, preferredLanguage: r.preferred_language });

export const usersRepo = (q) => ({
  async create({ name, email, passwordHash }) {
    const { rows } = await q.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, name, email, role, created_at, updated_at`,
      [name, email, passwordHash],
    );
    await q.query('INSERT INTO user_preferences (user_id) VALUES ($1)', [rows[0].id]);
    return mapUser(rows[0]);
  },
  async findAuthByEmail(email) {
    const { rows } = await q.query('SELECT id, password_hash FROM users WHERE email = $1', [email]);
    return rows[0] ? { id: rows[0].id, passwordHash: rows[0].password_hash } : null;
  },
  async findById(id) {
    const { rows } = await q.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at, u.updated_at, p.theme, p.preferred_language
       FROM users u LEFT JOIN user_preferences p ON p.user_id = u.id WHERE u.id = $1`,
      [id],
    );
    return rows[0] ? { user: mapUser(rows[0]), preferences: mapPrefs(rows[0]) } : null;
  },
  async updateName(id, name) {
    await q.query('UPDATE users SET name = $2, updated_at = now() WHERE id = $1', [id, name]);
  },
  async upsertPreferences(id, { theme, preferredLanguage }) {
    await q.query(
      `INSERT INTO user_preferences (user_id, theme, preferred_language)
       VALUES ($1, COALESCE($2, 'dark'), COALESCE($3, 'javascript'))
       ON CONFLICT (user_id) DO UPDATE SET
         theme = COALESCE($2, user_preferences.theme),
         preferred_language = COALESCE($3, user_preferences.preferred_language),
         updated_at = now()`,
      [id, theme ?? null, preferredLanguage ?? null],
    );
  },
});

export const tokensRepo = (q) => ({
  async create(userId, tokenHash, expiresAt) {
    await q.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [userId, tokenHash, expiresAt]);
  },
  async find(tokenHash) {
    const { rows } = await q.query(
      'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    return rows[0] ? { id: rows[0].id, userId: rows[0].user_id, expiresAt: rows[0].expires_at, revokedAt: rows[0].revoked_at } : null;
  },
  /** Atomically revoke an active token; returns true only for the caller that revoked it. */
  async revokeIfActive(tokenHash) {
    const { rowCount } = await q.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash]);
    return rowCount === 1;
  },
  async revokeAllForUser(userId) {
    await q.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  },
});
