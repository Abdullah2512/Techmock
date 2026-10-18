import { GoogleGenAI } from '@google/genai';
import { AppError } from '../errors.js';

function safeErrorMessage(err, apiKey) {
  let message = String(err?.message ?? 'Unknown Gemini error.');
  if (apiKey) message = message.split(apiKey).join('[REDACTED]');
  return message
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED]')
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, 500);
}

async function generateJson({ client, model, timeoutMs, systemInstruction, body, apiKey, logger }) {
  if (!client) throw new AppError(503, 'LLM_NOT_CONFIGURED', 'Gemini API key is not configured.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await client.interactions.create({
      model,
      input: JSON.stringify(body),
      system_instruction: systemInstruction,
      generation_config: { temperature: 0.7 },
      response_format: { type: 'text', mime_type: 'application/json' },
    }, { signal: controller.signal, timeout_ms: timeoutMs });
    const content = response.output_text;
    console.log('[Gemini debug]', {
  hasOutput: Boolean(content?.trim()),
  outputLength: content?.length ?? 0,
  model,
});
    if (!content?.trim()) throw new AppError(502, 'LLM_INVALID_RESPONSE', 'AI returned empty response.');
    let data;
    try {
      data = JSON.parse(content);
    } catch {
      throw new AppError(502, 'LLM_INVALID_RESPONSE', 'AI returned invalid JSON.');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new AppError(502, 'LLM_INVALID_RESPONSE', 'AI returned invalid JSON.');
    }
    return data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger?.error('gemini_request_failed', {
      name: String(err?.name ?? 'Error').slice(0, 100),
      status: err?.status ?? err?.statusCode ?? null,
      code: err?.code ?? null,
      message: safeErrorMessage(err, apiKey),
    });
    if (err?.name === 'AbortError') throw new AppError(504, 'LLM_TIMEOUT', 'AI request timed out.');
    if (err?.status === 429 || err?.statusCode === 429 || /\b429\b|RESOURCE_EXHAUSTED/i.test(err?.message ?? '')) {
      throw new AppError(429, 'LLM_RATE_LIMITED', 'AI rate limit exceeded.');
    }
    throw new AppError(503, 'LLM_UNAVAILABLE', 'Gemini could not process the request.');
  } finally {
    clearTimeout(timer);
  }
}

export function createAiProvider({ apiKey, model, timeoutMs = 30000, logger }) {
  const client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  const generate = (systemInstruction, body) =>
    generateJson({ client, model, timeoutMs, systemInstruction, body, apiKey, logger });

  return {
    async generateQuestion(body) {
      const data = await generate(
        'You are a technical interviewer. Generate one interview question for the supplied topic, difficulty, and mode. Return a JSON object with prompt (string), metadata (object with title, constraints, examples, starter_code, and hints), model, and prompt_version. Ensure coding questions include a clear problem statement and useful starter code for the requested languages.',
        body,
      );
      return {
        ...data,
        source: 'live',
        model: data.model ?? model,
        prompt_version: data.prompt_version ?? 'q-v1',
      };
    },
    async evaluateAnswer(body) {
      const data = await generate(
        'You are a technical interviewer. Evaluate the supplied answer using the applicable rubric. Return a JSON object with total_score, category_scores, strengths, weaknesses, suggestions, explanation, interviewer_summary, rubric, execution_status, and complexity_analysis.',
        body,
      );
      return { ...data, source: 'live', model: data.model ?? model };
    },
    async evaluateCode(body) {
      const data = await generate(
        'You are a technical interviewer. Evaluate the supplied code using the applicable rubric. Return a JSON object with total_score, category_scores, strengths, weaknesses, suggestions, explanation, interviewer_summary, rubric, execution_status, and complexity_analysis.',
        body,
      );
      return { ...data, source: 'live', model: data.model ?? model };
    },
    async executeCode() {
      throw new AppError(503, 'JUDGE0_NOT_CONFIGURED', 'Code execution requires Judge0 integration.');
    },
    async health() {
      return { status: 'up', mode: apiKey ? 'live' : 'unconfigured' };
    },
  };
}
