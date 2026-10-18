// Model/provider output is untrusted (SEC-13): everything coming back from the AI service is
// re-validated here before it is persisted or sent to the browser. Unknown keys are stripped.
import { z } from 'zod';

const str = (max) => z.string().max(max);

export const aiQuestionSchema = z.object({
  source: z.enum(['live', 'demo']),
  prompt: z.string().min(1).max(12_000),
  metadata: z
    .object({
      title: str(200).default(''),
      constraints: z.array(str(500)).max(20).default([]),
      examples: z
        .array(z.object({ input: str(2000), output: str(2000), explanation: str(2000).optional() }))
        .max(10)
        .default([]),
      starter_code: z.record(z.string().max(20), str(20_000)).default({}),
      hints: z.array(str(500)).max(5).default([]),
    })
    .default({ title: '', constraints: [], examples: [], starter_code: {}, hints: [] }),
  model: str(100).nullish(),
  prompt_version: str(50).nullish(),
});

const categoryScore = z
  .object({ category: str(80).min(1), score: z.number().min(0).max(100), max_score: z.number().gt(0).max(100), evidence: str(1500).min(1) })
  .refine((c) => c.score <= c.max_score, 'score exceeds max_score');

export const aiEvaluationSchema = z
  .object({
    source: z.enum(['live', 'demo']),
    total_score: z.number().min(0).max(100),
    category_scores: z.array(categoryScore).min(1).max(10),
    strengths: z.array(str(600)).max(10).default([]),
    weaknesses: z.array(str(600)).max(10).default([]),
    suggestions: z.array(str(600)).max(10).default([]),
    explanation: str(4000).default(''),
    interviewer_summary: str(3000).min(1),
    rubric: z.array(z.object({ category: str(80), max_points: z.number().gt(0).max(100) })).max(10).default([]),
    execution_status: str(200).nullish(),
    complexity_analysis: z
      .object({ time: str(200).nullish(), space: str(200).nullish(), basis: str(60), note: str(600).nullish() })
      .nullish(),
    model: str(100).nullish(),
    prompt_version: str(50).nullish(),
  })
  .refine((e) => Math.abs(e.category_scores.reduce((s, c) => s + c.score, 0) - e.total_score) <= 1, {
    message: 'total_score is inconsistent with category scores',
  })
  .refine((e) => Math.abs(e.category_scores.reduce((s, c) => s + c.max_score, 0) - 100) <= 0.5, {
    message: 'rubric weights must sum to 100',
  });

export const aiExecutionSchema = z.object({
  source: z.enum(['live', 'demo']),
  available: z.boolean(),
  status: z.object({ id: z.number().int().nullable(), description: str(200) }),
  stdout: str(30_000).nullish(),
  stderr: str(30_000).nullish(),
  compile_output: str(30_000).nullish(),
  message: str(2000).nullish(),
  time: z.union([z.string(), z.number()]).nullish(),
  memory: z.number().nullish(),
  token: str(100).nullish(),
});
