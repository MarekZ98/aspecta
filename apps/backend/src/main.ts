import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { z } from 'zod';
import { AppModule, configureApp } from '@/app.module';
import { JsonLogger } from '@/common/logger';
import { loadEnv, type AppConfig } from '@/config/env';

function readConfig(): AppConfig {
  try {
    return loadEnv();
  } catch (error) {
    if (error instanceof z.ZodError) {
      process.stderr.write(`Invalid environment:\n${z.prettifyError(error)}\n`);
      process.exit(1);
    }
    throw error;
  }
}

async function bootstrap(): Promise<void> {
  const config = readConfig();
  const logger = new JsonLogger(config.logLevel);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, logger), {
    logger,
    bufferLogs: true,
  });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(config.port);
  logger.write('info', 'backend started', { port: config.port, metricsPort: config.metricsPort });
}

void bootstrap();
