import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { JsonLogger, requestContext } from '@/common/logger';
import { httpRequestDuration, httpRequestsTotal } from '@/metrics/metrics';

const PROBE_PATHS = new Set(['/healthz', '/readyz']);

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly logger: JsonLogger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = req.header('x-request-id') || randomUUID();
    res.setHeader('X-Request-Id', requestId);
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      if (PROBE_PATHS.has(req.originalUrl.split('?')[0] ?? '')) {
        return;
      }
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      const labels = { method: req.method, route: routeLabel(req), status: String(res.statusCode) };
      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, durationSeconds);
      // Runs after the request context is gone, so the ID is passed explicitly.
      this.logger.write('info', 'request', {
        requestId,
        method: labels.method,
        route: labels.route,
        status: res.statusCode,
        durationMs: Math.round(durationSeconds * 1000),
      });
    });

    requestContext.run({ requestId }, next);
  }
}

/** Uses the route template, not the raw URL, to keep metric cardinality low. */
function routeLabel(req: Request): string {
  const route: unknown = req.route;
  if (typeof route === 'object' && route !== null && 'path' in route && typeof route.path === 'string') {
    return `${req.baseUrl}${route.path}`;
  }
  return 'unmatched';
}
