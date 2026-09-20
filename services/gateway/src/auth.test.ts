import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

const KEY_A = 'a'.repeat(32);
const KEY_B = 'b'.repeat(32);

vi.mock('./config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./config')>()),
  getConfig: () => ({
    apiKeys: new Map([[KEY_A, 'acme']]),
    authMaxFailures: 3,
    authFailureWindowMs: 60_000,
  }),
}));

import { registerAuth, resetAuthLimiter } from './auth';
import { MIN_API_KEY_LENGTH, scanApiKeys } from './config';
import { createFailureLimiter } from './rate-limit';

async function buildApp() {
  const app = Fastify();
  registerAuth(app);
  app.post('/v1/precheck', async (request) => ({ clientId: request.gatewayClientId }));
  app.get('/health', async () => ({ ok: true }));
  return app;
}

const post = (app: Awaited<ReturnType<typeof buildApp>>, key?: string) =>
  app.inject({ method: 'POST', url: '/v1/precheck', headers: key ? { 'x-api-key': key } : {}, payload: {} });

describe('scanApiKeys', () => {
  it('maps each key to its lower-cased client id', () => {
    const keys = scanApiKeys({ GATEWAY_API_KEY_ACME: KEY_A, GATEWAY_API_KEY_globex: KEY_B });
    expect(keys.get(KEY_A)).toBe('acme');
    expect(keys.get(KEY_B)).toBe('globex');
  });

  it('throws when two clients share a key, naming both clients but not the key', () => {
    const env = { GATEWAY_API_KEY_acme: KEY_A, GATEWAY_API_KEY_globex: KEY_A };
    expect(() => scanApiKeys(env)).toThrow(/acme.*globex|globex.*acme/);
    expect(() => scanApiKeys(env)).not.toThrow(new RegExp(KEY_A));
  });

  it('throws when a key is shorter than the minimum, naming the variable but not the key', () => {
    const short = 'x'.repeat(MIN_API_KEY_LENGTH - 1);
    const call = () => scanApiKeys({ GATEWAY_API_KEY_acme: short });
    expect(call).toThrow(/GATEWAY_API_KEY_acme/);
    expect(call).not.toThrow(new RegExp(short));
  });

  it('accepts a key of exactly the minimum length and ignores unrelated variables', () => {
    const keys = scanApiKeys({ GATEWAY_API_KEY_acme: 'k'.repeat(MIN_API_KEY_LENGTH), OTHER: 'short' });
    expect(keys.size).toBe(1);
  });
});

describe('createFailureLimiter', () => {
  it('blocks after maxFailures and unblocks when the window passes', () => {
    let t = 1_000;
    const limiter = createFailureLimiter({ maxFailures: 2, windowMs: 10_000, now: () => t });
    limiter.recordFailure('ip');
    expect(limiter.retryAfterSeconds('ip')).toBe(0);
    limiter.recordFailure('ip');
    expect(limiter.retryAfterSeconds('ip')).toBe(10);
    t += 10_000;
    expect(limiter.retryAfterSeconds('ip')).toBe(0);
  });

  it('tracks sources independently', () => {
    const limiter = createFailureLimiter({ maxFailures: 1, windowMs: 10_000 });
    limiter.recordFailure('a');
    expect(limiter.retryAfterSeconds('a')).toBeGreaterThan(0);
    expect(limiter.retryAfterSeconds('b')).toBe(0);
  });
});

describe('/v1 authentication', () => {
  beforeEach(() => resetAuthLimiter());

  it('accepts a valid key and resolves the client', async () => {
    const res = await post(await buildApp(), KEY_A);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ clientId: 'acme' });
  });

  it('returns 401 for a missing or wrong key', async () => {
    const app = await buildApp();
    expect((await post(app)).statusCode).toBe(401);
    expect((await post(app, KEY_B)).statusCode).toBe(401);
  });

  it('returns 429 with Retry-After after too many failures, even for a valid key', async () => {
    const app = await buildApp();
    for (let i = 0; i < 3; i++) expect((await post(app, KEY_B)).statusCode).toBe(401);

    const blocked = await post(app, KEY_A);
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not count successful requests toward the limit', async () => {
    const app = await buildApp();
    for (let i = 0; i < 10; i++) expect((await post(app, KEY_A)).statusCode).toBe(200);
  });

  it('never rate-limits /health', async () => {
    const app = await buildApp();
    for (let i = 0; i < 5; i++) await post(app, KEY_B);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});
