import { AppError } from '../errors.js';

/** Validate req[source] with a zod schema; parsed output is stored on req.valid[source]. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    const details = result.error.issues.slice(0, 10).map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return next(new AppError(400, 'VALIDATION_ERROR', 'The request contains invalid data.', details));
  }
  req.valid = { ...(req.valid ?? {}), [source]: result.data };
  next();
};
