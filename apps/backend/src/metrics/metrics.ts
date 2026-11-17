import http from 'node:http';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';
import { APP_CONFIG, type AppConfig } from '@/config/env';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

const labelNames = ['method', 'route', 'status'] as const;

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Number of HTTP requests.',
  labelNames,
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export async function countRequests(): Promise<number> {
  const { values } = await httpRequestsTotal.get();
  return values.reduce((sum, sample) => sum + sample.value, 0);
}

/** Separate server so metrics are never reachable through the Ingress. */
export function startMetricsServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    const path = req.url?.split('?')[0];
    if (req.method !== 'GET' || path !== '/metrics') {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not Found');
      return;
    }
    registry.metrics().then(
      (body) => res.writeHead(200, { 'Content-Type': registry.contentType }).end(body),
      () => res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Internal Server Error'),
    );
  });
  server.listen(port);
  return server;
}

@Injectable()
export class MetricsServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private server?: http.Server;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  onApplicationBootstrap(): void {
    this.server = startMetricsServer(this.config.metricsPort);
  }

  /** Nest calls this after the HTTP server is closed, so metrics stay scrapeable until the end. */
  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (!server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
