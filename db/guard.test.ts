import { describe, expect, it } from 'vitest';
import { assertNotProduction, endpointOf, isProtected, OVERRIDE_ENV, OVERRIDE_VALUE } from './guard';

const PROD = 'ep-prod-abc123';
const opts = (env: Record<string, string | undefined> = {}) => ({ protectedEndpoints: [PROD], env });
const url = (host: string) => `postgresql://user:not-a-real-password@${host}.us-west-2.aws.neon.tech/db?sslmode=require`;

describe('endpointOf', () => {
  it('reads the endpoint name from pooled and unpooled hosts', () => {
    expect(endpointOf(url(PROD))).toBe(PROD);
    expect(endpointOf(url(`${PROD}-pooler`))).toBe(`${PROD}-pooler`);
  });
  it('returns null for non-Neon hosts and unparseable input', () => {
    expect(endpointOf('postgresql://u:p@localhost:5432/db')).toBeNull();
    expect(endpointOf('not a url')).toBeNull();
  });
});

describe('isProtected', () => {
  it('matches the endpoint and its pooler/compute variants only', () => {
    expect(isProtected(PROD, [PROD])).toBe(true);
    expect(isProtected(`${PROD}-pooler`, [PROD])).toBe(true);
    expect(isProtected(`${PROD}-hbr-pooler`, [PROD])).toBe(true);
    expect(isProtected('ep-prod-abc1234', [PROD])).toBe(false); // longer name, different endpoint
    expect(isProtected('ep-other-xyz', [PROD])).toBe(false);
  });
});

describe('assertNotProduction', () => {
  it('refuses the production endpoint, pooled or not, and names the override', () => {
    for (const host of [PROD, `${PROD}-pooler`]) {
      expect(() => assertNotProduction(url(host), { ...opts(), command: 'db:push' })).toThrow(/REFUSING to run db:push/);
    }
    expect(() => assertNotProduction(url(PROD), opts())).toThrow(new RegExp(`${OVERRIDE_ENV}=${OVERRIDE_VALUE}`));
  });

  it('never prints the password or the full connection string', () => {
    try {
      assertNotProduction(url(PROD), opts());
      throw new Error('should have thrown');
    } catch (e) {
      const msg = String((e as Error).message);
      expect(msg).not.toContain('not-a-real-password');
      expect(msg).not.toContain('postgresql://');
    }
  });

  it('allows non-production endpoints', () => {
    expect(() => assertNotProduction(url('ep-dev-branch-999'), opts())).not.toThrow();
    expect(() => assertNotProduction('postgresql://u:p@localhost:5432/db', opts())).not.toThrow();
  });

  it('allows production only with the exact deliberate override', () => {
    expect(() => assertNotProduction(url(PROD), opts({ [OVERRIDE_ENV]: OVERRIDE_VALUE }))).not.toThrow();
    expect(() => assertNotProduction(url(PROD), opts({ [OVERRIDE_ENV]: '1' }))).toThrow(/REFUSING/);
    expect(() => assertNotProduction(url(PROD), opts({ [OVERRIDE_ENV]: 'true' }))).toThrow(/REFUSING/);
  });

  it('does nothing when there is no URL (callers report that themselves)', () => {
    expect(() => assertNotProduction(undefined, opts())).not.toThrow();
    expect(() => assertNotProduction('', opts())).not.toThrow();
  });
});

describe('the committed protected list', () => {
  it('protects the real production endpoint (pooled and unpooled) using a fake password', async () => {
    const { loadProtectedEndpoints } = await import('./guard');
    const list = loadProtectedEndpoints();
    expect(list).toContain('ep-frosty-frost-a6yzgmv2');
    for (const host of ['ep-frosty-frost-a6yzgmv2', 'ep-frosty-frost-a6yzgmv2-pooler']) {
      expect(() => assertNotProduction(url(host), { env: {} })).toThrow(/REFUSING/);
    }
  });
});
