import { z } from 'zod';
import { THEMES, LANGUAGES } from '../domain/constants.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')).refine((v) => v.length <= 254, 'Email is too long.');
// bcrypt only uses the first 72 bytes, so reject anything longer instead of silently truncating.
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 bytes.');
const name = z.string().trim().min(1, 'Name is required.').max(80, 'Name must be at most 80 characters.');

export const registerSchema = z.strictObject({ name, email, password });
export const loginSchema = z.strictObject({ email, password: z.string().min(1).max(200) });

export const profilePatchSchema = z
  .strictObject({
    name: name.optional(),
    theme: z.enum(THEMES).optional(),
    preferredLanguage: z.enum(LANGUAGES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update.');
