// src/middleware/errorHandler.ts
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Global error handler middleware
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  const isOperational = err instanceof AppError && err.statusCode < 500;
  const log = isOperational ? logger.warn.bind(logger) : logger.error.bind(logger);
  log('Request failed', {
    error: err.message,
    stack: isOperational ? undefined : err.stack,
    path: req.path,
    method: req.method,
    correlationId: req.headers['x-correlation-id'],
  });

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(err, res);
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: 'Invalid request for database operation' });
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      statusCode: err.statusCode,
    });
  }

  // Handle multer errors (file upload) and the upload file filter
  if (err.name === 'MulterError' || err.message === 'Only image files are allowed') {
    return res.status(400).json({
      error: 'File upload error',
      details: err.message,
    });
  }

  // Malformed JSON body
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }

  // Default to 500 server error
  return res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};

/**
 * Handle Prisma-specific errors
 */
const handlePrismaError = (err: Prisma.PrismaClientKnownRequestError, res: Response) => {
  switch (err.code) {
    case 'P2002':
      // Unique constraint violation
      return res.status(409).json({
        error: 'Resource already exists',
        field: (err.meta?.target as string[])?.join(', '),
      });

    case 'P2025':
      // Record not found
      return res.status(404).json({
        error: 'Resource not found',
      });

    case 'P2003':
      // Foreign key constraint failed
      return res.status(400).json({
        error: 'Invalid reference',
        details: 'The referenced resource does not exist',
      });

    default:
      return res.status(500).json({
        error: 'Database error',
        code: err.code,
      });
  }
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
  });
};

/**
 * Async handler wrapper to catch promise rejections
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
