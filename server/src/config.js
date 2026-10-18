import { z } from 'zod';

const bool = (def) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(7),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  AI_MODEL: z.string().default('gemini-3.8-flash'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
  AI_EXECUTE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(45000),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  RATE_LIMIT_ENABLED: bool(true),
  TRUST_PROXY: bool(false),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
});

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const c = parsed.data;
  return {
    env: c.NODE_ENV,
    isProd: c.NODE_ENV === 'production',
    port: c.PORT,
    databaseUrl: c.DATABASE_URL,
    dbPoolMax: c.DB_POOL_MAX,
    jwtAccessSecret: c.JWT_ACCESS_SECRET,
    jwtRefreshSecret: c.JWT_REFRESH_SECRET,
    accessTtlSeconds: c.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlDays: c.REFRESH_TOKEN_TTL_DAYS,
    cookieSameSite: c.COOKIE_SAMESITE,
    clientOrigins: c.CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
    geminiApiKey: c.GEMINI_API_KEY,
    aiModel: c.AI_MODEL,

    aiTimeoutMs: c.AI_TIMEOUT_MS,
    aiExecuteTimeoutMs: c.AI_EXECUTE_TIMEOUT_MS,
    bcryptRounds: c.BCRYPT_ROUNDS,
    rateLimitEnabled: c.RATE_LIMIT_ENABLED,
    trustProxy: c.TRUST_PROXY,
  };
}






