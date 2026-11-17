import { z } from 'zod';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const port = z.coerce.number().int().min(0).max(65535);

const envSchema = z.object({
  PORT: port.default(3000),
  METRICS_PORT: port.default(9100),
  APP_ENV: z.string().min(1).default('local'),
  APP_VERSION: z.string().min(1).default('dev'),
  GREETING: z.string().min(1).default('Hello from Aspecta'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  CHAOS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SHUTDOWN_DELAY_MS: z.coerce.number().int().min(0).default(5000),
  ADMIN_TOKEN: z.string().min(32, 'ADMIN_TOKEN must have at least 32 characters'),
});

export interface AppConfig {
  port: number;
  metricsPort: number;
  appEnv: string;
  appVersion: string;
  greeting: string;
  logLevel: LogLevel;
  chaosEnabled: boolean;
  shutdownDelayMs: number;
  adminToken: string;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Throws a ZodError when the environment is invalid. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = envSchema.parse(source);
  return {
    port: env.PORT,
    metricsPort: env.METRICS_PORT,
    appEnv: env.APP_ENV,
    appVersion: env.APP_VERSION,
    greeting: env.GREETING,
    logLevel: env.LOG_LEVEL,
    chaosEnabled: env.CHAOS_ENABLED,
    shutdownDelayMs: env.SHUTDOWN_DELAY_MS,
    adminToken: env.ADMIN_TOKEN,
  };
}
