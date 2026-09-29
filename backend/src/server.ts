// src/server.ts
import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { prisma } from './lib/prisma';
import { getVisionProvider } from './services/visionService';
import { logger } from './utils/logger';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error: any) {
    logger.error('Failed to connect to database', { error: error.message });
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Vision provider: ${getVisionProvider() ?? 'disabled (set OPENAI_API_KEY or VISION_PROVIDER=mock)'}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
  });

  let shuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received. Starting graceful shutdown...`);

    server.close(async () => {
      await prisma.$disconnect();
      logger.info('HTTP server and database connection closed');
      process.exit(0);
    });

    // Live-event (SSE) streams never finish on their own; give in-flight
    // requests a moment, then drop remaining connections.
    setTimeout(() => server.closeAllConnections(), 3_000).unref();

    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((error) => {
  logger.error('Failed to start server', { error: error?.message });
  process.exit(1);
});
