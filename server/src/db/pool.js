import pg from 'pg';
import { wrapDbError } from './errors.js';

// int8 (count(*)) comes back as a string by default; counts here are small.
pg.types.setTypeParser(20, (v) => Number(v));

/**
 * Database handle used by repositories:
 *   db.query(text, params) -> { rows, rowCount }
 *   db.transaction(async (tx) => { tx.query(...) })
 *   db.close()
 * The URL (e.g. Neon `?sslmode=require`) is read from DATABASE_URL by the caller.
 */
export function createPgDb({ connectionString, max = 10, logger }) {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 10_000, // Neon suspends idle connections; keep them short-lived
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
  });
  pool.on('error', (err) => logger?.error('db_pool_error', { message: err.message, code: err.code }));

  const run = async (client, text, params) => {
    try {
      const r = await client.query(text, params);
      return { rows: r.rows, rowCount: r.rowCount };
    } catch (err) {
      throw wrapDbError(err);
    }
  };

  return {
    query: (text, params = []) => run(pool, text, params),
    async transaction(fn) {
      let client;
      try {
        client = await pool.connect();
      } catch (err) {
        throw wrapDbError(err);
      }
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (t, p = []) => run(client, t, p) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* connection may already be gone */ }
        throw wrapDbError(err);
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
