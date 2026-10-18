import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimal forward-only SQL migration runner.
 * Applies migrations/NNN_name.sql in order, each in a transaction, and records a checksum
 * so an already-applied file that was edited afterwards is reported instead of silently skipped.
 */
export async function runMigrations(db, dir, log = () => {}) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied = new Map(
    (await db.query('SELECT name, checksum FROM schema_migrations')).rows.map((r) => [r.name, r.checksum]),
  );
  const ran = [];
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(`Migration ${file} was modified after being applied. Add a new migration instead.`);
      }
      continue;
    }
    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
    });
    log(`applied ${file}`);
    ran.push(file);
  }
  return ran;
}
