import { zValidator } from '@hono/zod-validator';
import type { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json({ message: result.error.errors[0].message, errors: result.error.errors }, 400);
    }
  });
}

export function validateQuery(schema: ZodSchema) {
  return zValidator('query', schema, (result, c) => {
    if (!result.success) {
      return c.json({ message: result.error.errors[0].message, errors: result.error.errors }, 400);
    }
  });
}
