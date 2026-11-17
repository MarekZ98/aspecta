import 'reflect-metadata';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule, configureApp } from '@/app.module';
import { JsonLogger } from '@/common/logger';
import type { AppConfig } from '@/config/env';
import { ReadinessService } from '@/health/readiness.service';
import { registry, startMetricsServer } from '@/metrics/metrics';

const adminToken = 'a'.repeat(40);

let app: NestExpressApplication | undefined;

async function startApp(overrides: Partial<AppConfig> = {}): Promise<Server> {
  const config: AppConfig = {
    port: 0,
    metricsPort: 0,
    appEnv: 'test',
    appVersion: 'sha-test123',
    greeting: 'Hello from tests',
    logLevel: 'error',
    chaosEnabled: false,
    shutdownDelayMs: 0,
    adminToken,
    ...overrides,
  };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config, new JsonLogger('error'))],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return app.getHttpServer();
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /api/info', () => {
  it('returns service info and echoes X-Request-Id', async () => {
    const server = await startApp();
    const res = await request(server).get('/api/info').set('X-Request-Id', 'req-123').expect(200);

    expect(res.headers['x-request-id']).toBe('req-123');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.body).toEqual({
      service: 'backend',
      version: 'sha-test123',
      environment: 'test',
      greeting: 'Hello from tests',
      hostname: expect.any(String) as string,
      uptimeSeconds: expect.any(Number) as number,
      timestamp: expect.any(String) as string,
    });
  });

  it('creates a request ID when none is sent', async () => {
    const server = await startApp();
    const res = await request(server).get('/api/info').expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('GET /api/admin/stats', () => {
  it('returns 401 without a token', async () => {
    const server = await startApp();
    const res = await request(server).get('/api/admin/stats').expect(401);
    expect(res.body).toEqual({ message: 'Unauthorized' });
  });

  it('returns 401 with a wrong token', async () => {
    const server = await startApp();
    await request(server).get('/api/admin/stats').set('Authorization', 'Bearer wrong').expect(401);
    await request(server).get('/api/admin/stats').set('Authorization', adminToken).expect(401);
  });

  it('returns stats with the right token', async () => {
    const server = await startApp();
    const res = await request(server)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toEqual({
      hostname: expect.any(String) as string,
      uptimeSeconds: expect.any(Number) as number,
      requestsTotal: expect.any(Number) as number,
      memoryRssBytes: expect.any(Number) as number,
    });
  });
});

describe('chaos endpoints', () => {
  it('return 404 when chaos is disabled', async () => {
    const server = await startApp();
    await request(server).get('/api/chaos/error').expect(404);
    await request(server).get('/api/chaos/slow?ms=10').expect(404);
  });

  it('return 500 and a delayed 200 when chaos is enabled', async () => {
    const server = await startApp({ chaosEnabled: true });
    await request(server).get('/api/chaos/error').expect(500);
    const res = await request(server).get('/api/chaos/slow?ms=20').expect(200);
    expect(res.body).toEqual({ delayedMs: 20 });
  });

  it('rejects an invalid delay', async () => {
    const server = await startApp({ chaosEnabled: true });
    await request(server).get('/api/chaos/slow?ms=5001').expect(400);
    await request(server).get('/api/chaos/slow?ms=abc').expect(400);
    await request(server).get('/api/chaos/slow').expect(400);
  });
});

describe('probes', () => {
  it('GET /healthz returns ok', async () => {
    const server = await startApp();
    const res = await request(server).get('/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /readyz returns ready, then 503 after shutdown starts', async () => {
    const server = await startApp();
    const ready = await request(server).get('/readyz').expect(200);
    expect(ready.body).toEqual({ status: 'ready' });

    await app?.get(ReadinessService).beforeApplicationShutdown();
    const notReady = await request(server).get('/readyz').expect(503);
    expect(notReady.body).toEqual({ status: 'shutting-down' });
  });
});

describe('metrics', () => {
  it('records requests by route template', async () => {
    const server = await startApp();
    await request(server).get('/api/info').expect(200);
    await request(server).get('/api/does-not-exist').expect(404);
    await request(server).get('/healthz').expect(200);

    const text = await registry.getSingleMetricAsString('http_requests_total');
    expect(text).toContain('route="/api/info",status="200"');
    expect(text).toContain('route="unmatched",status="404"');
    expect(text).not.toContain('/healthz');
  });

  it('serves /metrics on the metrics server and 404 on other paths', async () => {
    const metricsServer = startMetricsServer(0);
    await once(metricsServer, 'listening');
    const { port } = metricsServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${String(port)}`;

    try {
      const res = await request(baseUrl).get('/metrics').expect(200);
      expect(res.text).toContain('http_request_duration_seconds');
      expect(res.text).toContain('process_cpu_seconds_total');
      await request(baseUrl).get('/other').expect(404);
    } finally {
      metricsServer.close();
    }
  });
});
