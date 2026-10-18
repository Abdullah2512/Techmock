import { z } from 'zod';
import {
  TOPICS, DIFFICULTIES, MODES, DURATIONS, CODING_TOPICS, LANGUAGES, LIMITS, SESSION_STATUS,
} from '../domain/constants.js';

const uuid = z.uuid('Invalid id.');
export const idParams = z.object({ id: uuid });

export const createInterviewSchema = z
  .strictObject({
    topic: z.enum(TOPICS),
    difficulty: z.enum(DIFFICULTIES),
    mode: z.enum(MODES),
    durationMinutes: z.number().int().refine((d) => DURATIONS.includes(d), `Duration must be one of ${DURATIONS.join(', ')}.`),
  })
  .refine((v) => v.mode !== 'coding' || CODING_TOPICS.includes(v.topic), {
    message: 'Coding mode is not available for this topic. Use Technical Q&A.',
    path: ['mode'],
  });

export const listInterviewsQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(Object.values(SESSION_STATUS)).optional(),
  mode: z.enum(MODES).optional(),
  topic: z.enum(TOPICS).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['created_at', 'score', 'topic']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const code = z.string().max(LIMITS.sourceCode, `Code must be at most ${LIMITS.sourceCode} characters.`);
const text = z.string().max(LIMITS.answerText, `Answer must be at most ${LIMITS.answerText} characters.`);

export const answerSchema = z.strictObject({
  questionId: uuid.optional(),
  answerText: text.optional(),
  sourceCode: code.optional(),
  language: z.enum(LANGUAGES).optional(),
  requestFollowUp: z.boolean().optional(),
});

export const runSchema = z.strictObject({
  questionId: uuid.optional(),
  sourceCode: code.min(1, 'Source code is required.'),
  language: z.enum(LANGUAGES),
  stdin: z.string().max(LIMITS.stdin).optional(),
});

export const submitSchema = z.strictObject({
  answerText: text.optional(),
  sourceCode: code.optional(),
  language: z.enum(LANGUAGES).optional(),
});
