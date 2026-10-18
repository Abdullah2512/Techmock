// Minimal structured JSON logger with redaction (SRS FR-20, SEC-09).
const SENSITIVE_KEY = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|source_?code|answer_?text|stdin|database_?url/i;
const URL_CREDS = /\b(postgres(?:ql)?|https?):\/\/[^\s"']*@[^\s"']+/gi;

export function scrubString(s) {
  return String(s).replace(URL_CREDS, '$1://[REDACTED]');
}

export function redact(value, depth = 0) {
  if (value == null || depth > 4) return value;
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function createLogger({ level = 'info', sink = (line) => process.stdout.write(line + '\n') } = {}) {
  const order = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
  const emit = (lvl, msg, fields) => {
    if (order[lvl] < order[level]) return;
    sink(JSON.stringify({ time: new Date().toISOString(), level: lvl, msg: scrubString(msg), ...redact(fields) }));
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}
