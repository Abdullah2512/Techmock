// In-process real PostgreSQL (WASM) with the same handle interface as createPgDb.
// Used by the automated tests so SQL, constraints, jsonb and transactions are exercised for real.
import { PGlite } from '@electric-sql/pglite';
import { wrapDbError } from './errors.js';

export async function createPgliteDb() {
  const pg = new PGlite();
  await pg.waitReady;
  const exec = async (target, text, params) => {
    try {
      // Parameterless calls use the simple protocol (like node-postgres), allowing multi-statement SQL.
      if (params.length === 0) {
        const results = await target.exec(text);
        const last = results[results.length - 1] ?? { rows: [] };
        return { rows: last.rows, rowCount: last.affectedRows ?? last.rows.length };
      }
      const r = await target.query(text, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    } catch (err) {
      throw wrapDbError(err);
    }
  };
  return {
    raw: pg,
    query: (text, params = []) => exec(pg, text, params),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (t, p = []) => exec(tx, t, p) })),
    close: () => pg.close(),
  };
}
