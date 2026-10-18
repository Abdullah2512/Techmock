import { AppError } from '../errors.js';

// Upstream error codes the FastAPI service may return; anything else becomes a generic 502.
const PASS_THROUGH = {
  LLM_NOT_CONFIGURED: 503,
  JUDGE0_NOT_CONFIGURED: 503,
  LLM_UNAVAILABLE: 502,
  LLM_INVALID_RESPONSE: 502,
  EXECUTION_PROVIDER_ERROR: 502,
  EXECUTION_PROVIDER_TIMEOUT: 504,
  VALIDATION_ERROR: 502,
};

export function createAiClient({ baseUrl, token, timeoutMs, executeTimeoutMs, fetchImpl = fetch, logger }) {
  async function request(path, { method = 'POST', body, timeout = timeoutMs, requestId, retries = 0 } = {}) {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: { 'Content-Type': 'application/json', 'X-Service-Token': token, ...(requestId ? { 'X-Request-Id': requestId } : {}) },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        const text = await res.text();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* handled below */ }
        if (res.ok) {
          if (json === null) throw new AppError(502, 'AI_SERVICE_ERROR', 'The AI service returned an unreadable response.');
          return json;
        }
        const upstream = json?.error ?? json?.detail?.error ?? {};
        if (res.status === 401 || res.status === 403) {
          logger?.error('ai_service_auth_rejected', { requestId, path });
          throw new AppError(502, 'AI_SERVICE_MISCONFIGURED', 'The AI service rejected the server credential.');
        }
        const status = PASS_THROUGH[upstream.code];
        if (status) throw new AppError(status, upstream.code, String(upstream.message ?? 'AI service error.').slice(0, 300));
        logger?.warn('ai_service_error', { requestId, path, status: res.status });
        throw new AppError(502, 'AI_SERVICE_ERROR', 'The AI service failed to process the request.');
      } catch (err) {
        if (err instanceof AppError) throw err;
        const unreachable = err?.name === 'AbortError' ? 'timeout' : 'unreachable';
        if (unreachable === 'unreachable' && attempt < retries) { await new Promise((r) => setTimeout(r, 300)); continue; }
        logger?.warn('ai_service_unreachable', { requestId, path, reason: unreachable, message: err?.cause?.code ?? err?.message });
        throw unreachable === 'timeout'
          ? new AppError(504, 'AI_SERVICE_TIMEOUT', 'The AI service took too long to respond. Please try again.')
          : new AppError(503, 'AI_SERVICE_UNAVAILABLE', 'The AI service is currently unavailable. Please try again later.');
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return {
    generateQuestion: (body, requestId) => request('/generate-question', { body, requestId, retries: 1 }),
    evaluateAnswer: (body, requestId) => request('/evaluate-answer', { body, requestId }),
    evaluateCode: (body, requestId) => request('/evaluate-code', { body, requestId }),
    executeCode: (body, requestId) => request('/execute-code', { body, requestId, timeout: executeTimeoutMs }),
    health: () => request('/health', { method: 'GET', timeout: 2500 }),
  };
}
