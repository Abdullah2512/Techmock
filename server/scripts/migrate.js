import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPgDb } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';

// Use MIGRATION_DATABASE_URL (e.g. Neon's *direct*, non-pooled string with an owner role) when set;
// otherwise fall back to DATABASE_URL.
const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL (or MIGRATION_DATABASE_URL) in server/.env first.');
  process.exit(1);
}
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const db = createPgDb({ connectionString: url, max: 1 });
try {
  const ran = await runMigrations(db, dir, (m) => console.log(m));
  console.log(ran.length ? `Done: ${ran.length} migration(s) applied.` : 'Database already up to date.');
} catch (err) {
  console.error('Migration failed:', err.cause?.message ?? err.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
