import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { loadEnv } from '@/config/env';

const token = 'x'.repeat(32);

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv({ ADMIN_TOKEN: token })).toEqual({
      port: 3000,
      metricsPort: 9100,
      appEnv: 'local',
      appVersion: 'dev',
      greeting: 'Hello from Aspecta',
      logLevel: 'info',
      chaosEnabled: false,
      shutdownDelayMs: 5000,
      adminToken: token,
    });
  });

  it('parses numbers from strings', () => {
    const config = loadEnv({ ADMIN_TOKEN: token, PORT: '8080', SHUTDOWN_DELAY_MS: '0' });
    expect(config.port).toBe(8080);
    expect(config.shutdownDelayMs).toBe(0);
  });

  it('rejects an invalid LOG_LEVEL', () => {
    expect(() => loadEnv({ ADMIN_TOKEN: token, LOG_LEVEL: 'verbose' })).toThrow(ZodError);
  });

  it('rejects a missing or short ADMIN_TOKEN', () => {
    expect(() => loadEnv({})).toThrow(ZodError);
    expect(() => loadEnv({ ADMIN_TOKEN: 'x'.repeat(31) })).toThrow(/at least 32 characters/);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('parses CHAOS_ENABLED=%s', (value, expected) => {
    expect(loadEnv({ ADMIN_TOKEN: token, CHAOS_ENABLED: value }).chaosEnabled).toBe(expected);
  });

  it('rejects CHAOS_ENABLED values other than true or false', () => {
    expect(() => loadEnv({ ADMIN_TOKEN: token, CHAOS_ENABLED: '1' })).toThrow(ZodError);
  });
});
