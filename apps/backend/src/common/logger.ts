import { AsyncLocalStorage } from 'node:async_hooks';
import type { LoggerService } from '@nestjs/common';
import type { LogLevel } from '@/config/env';

export interface RequestContext {
  requestId: string;
}

/** Lets log lines written during a request carry its request ID. */
export const requestContext = new AsyncLocalStorage<RequestContext>();

const SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogFields = Record<string, string | number | boolean | undefined>;

export class JsonLogger implements LoggerService {
  constructor(private readonly level: LogLevel) {}

  write(level: LogLevel, msg: string, fields: LogFields = {}): void {
    if (SEVERITY[level] < SEVERITY[this.level]) {
      return;
    }
    const line = {
      timestamp: new Date().toISOString(),
      level,
      msg,
      requestId: requestContext.getStore()?.requestId,
      ...fields,
    };
    process.stdout.write(`${JSON.stringify(line)}\n`);
  }

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', toText(message), { context: contextOf(params) });
  }

  error(message: unknown, ...params: unknown[]): void {
    // Nest calls error(message, stack, context) or error(error, context).
    const stack = message instanceof Error ? message.stack : params.length > 1 ? params[0] : undefined;
    this.write('error', toText(message), {
      context: contextOf(params),
      stack: typeof stack === 'string' ? stack : undefined,
    });
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', toText(message), { context: contextOf(params) });
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', toText(message), { context: contextOf(params) });
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('debug', toText(message), { context: contextOf(params) });
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.error(message, ...params);
  }
}

function toText(message: unknown): string {
  if (message instanceof Error) {
    return message.message;
  }
  return typeof message === 'string' ? message : JSON.stringify(message);
}

function contextOf(params: unknown[]): string | undefined {
  const last = params.at(-1);
  return typeof last === 'string' ? last : undefined;
}
