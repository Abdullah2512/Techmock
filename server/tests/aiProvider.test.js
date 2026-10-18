import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createInteraction } = vi.hoisted(() => ({ createInteraction: vi.fn() }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create: createInteraction };
  },
}));

import { createAiProvider } from '../src/services/aiProvider.js';

describe('Gemini AI provider', () => {
  beforeEach(() => {
    createInteraction.mockReset();
  });

  it('generates a question as JSON using the configured Gemini model', async () => {
    const question = {
      prompt: 'Return the indices of two numbers that add up to the target.',
      metadata: { title: 'Two Sum' },
    };
    createInteraction.mockResolvedValue({ output_text: JSON.stringify(question) });
    const provider = createAiProvider({ apiKey: 'test-key', model: 'gemini-3.8-flash' });
    const input = { topic: 'dsa', difficulty: 'intermediate', mode: 'coding' };

    await expect(provider.generateQuestion(input)).resolves.toMatchObject({
      ...question,
      source: 'live',
      model: 'gemini-3.8-flash',
      prompt_version: 'q-v1',
    });
    expect(createInteraction).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gemini-3.8-flash',
      input: JSON.stringify(input),
      system_instruction: expect.any(String),
      response_format: { type: 'text', mime_type: 'application/json' },
    }), expect.objectContaining({ timeout_ms: 30000, signal: expect.any(AbortSignal) }));
  });

  it('reports Gemini rate limits distinctly', async () => {
    const geminiError = Object.assign(new Error('request failed with key=test-key and got status: 429 RESOURCE_EXHAUSTED'), {
      name: 'ClientError',
      status: 429,
      code: 'RESOURCE_EXHAUSTED',
    });
    createInteraction.mockRejectedValue(geminiError);
    const logger = { error: vi.fn() };
    const provider = createAiProvider({ apiKey: 'test-key', model: 'gemini-test-model', logger });

    await expect(provider.generateQuestion({})).rejects.toMatchObject({
      status: 429,
      code: 'LLM_RATE_LIMITED',
    });
    expect(logger.error).toHaveBeenCalledWith('gemini_request_failed', expect.objectContaining({
      name: 'ClientError',
      status: 429,
      code: 'RESOURCE_EXHAUSTED',
    }));
    expect(logger.error.mock.calls[0][1].message).not.toContain('test-key');
    expect(logger.error.mock.calls[0][1].message).toContain('[REDACTED]');
  });

  it('rejects JSON responses that are not objects', async () => {
    createInteraction.mockResolvedValue({ output_text: 'null' });
    const provider = createAiProvider({ apiKey: 'test-key', model: 'gemini-test-model' });

    await expect(provider.generateQuestion({})).rejects.toMatchObject({
      status: 502,
      code: 'LLM_INVALID_RESPONSE',
    });
  });

  it('fails explicitly when the Gemini key is missing', async () => {
    const provider = createAiProvider({ model: 'gemini-test-model' });

    await expect(provider.generateQuestion({})).rejects.toMatchObject({
      status: 503,
      code: 'LLM_NOT_CONFIGURED',
    });
  });
});
