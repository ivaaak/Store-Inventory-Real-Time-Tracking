// src/middleware/validation.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';

const validationError = (res: Response, error: ZodError) =>
  res.status(400).json({
    error: 'Validation failed',
    details: error.errors.map((err) => ({
      path: err.path.join('.'),
      message: err.message,
    })),
  });

/**
 * Validate and replace req.body with the parsed (coerced, defaulted) value.
 * Works for JSON and multipart bodies alike — multipart fields arrive as
 * strings, so schemas should coerce where needed.
 */
export const validateBody = (schema: ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await schema.safeParseAsync(req.body ?? {});
    if (!result.success) return validationError(res, result.error);
    req.body = result.data;
    next();
  };
};

/**
 * Validate the query string. The parsed value is stored on res.locals.query
 * because req.query is a getter in Express 5 and should be treated as read-only.
 */
export const validateQuery = (schema: ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await schema.safeParseAsync(req.query);
    if (!result.success) return validationError(res, result.error);
    res.locals.query = result.data;
    next();
  };
};

/** @deprecated multipart bodies are validated with validateBody */
export const validateMultipart = validateBody;
