import 'dotenv/config';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createPgDb } from './db/pool.js';
import { createAiProvider } from './services/aiProvider.js';
import { createApp } from './app.js';

const logger = createLogger({ level: process.env.LOG_LEVEL || 'info' });
let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const db = createPgDb({ connectionString: config.databaseUrl, max: config.dbPoolMax, logger });
const ai = createAiProvider({ apiKey: config.geminiApiKey, model: config.aiModel, timeoutMs: config.aiTimeoutMs, logger });
const app = createApp({ config, db, ai, logger });
const server = app.listen(config.port, () => logger.info('server_started', { port: config.port, env: config.env }));

const shutdown = (signal) => {
  logger.info('shutdown', { signal });
  server.close(async () => { await db.close().catch(() => {}); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
