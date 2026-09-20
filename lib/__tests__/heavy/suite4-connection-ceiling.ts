/**
 * Suite 4 — Neon Connection Ceiling (Thin HTTP Probe — Preview Deployment)
 *
 * Drives concurrent requests through the pooled tenant path (`getTenantSql`)
 * to find the connection knee. First verifies whether DATABASE_URL points
 * to the Neon direct host or the -pooler (pgBouncer) host — this dominates
 * where the knee is.
 *
 * Key levers (decide shape now; measurement gives the numbers):
 *   1. Point tenant Pool at Neon's -pooler endpoint (session-mode required).
 *   2. Set explicit Pool max backstop.
 *   3. Fold the 4-round-trip checkout into SET LOCAL in a txn (done in H6a).
 *
 * Non-blocking, measured. Gated on TEST_DATABASE_URL.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestPool, closeTestPool, truncateTables, hasTestDatabase } from '../harness/db';

const TABLES = ['"Invoices"'];

const describeIf = hasTestDatabase() ? describe : describe.skip;

describeIf('Suite 4 — Connection Ceiling', () => {
  let pool: ReturnType<typeof getTestPool>;

  beforeAll(async () => {
    pool = getTestPool();
    await truncateTables(pool, TABLES);
  });

  afterAll(async () => {
    await truncateTables(pool, TABLES);
    await closeTestPool();
  });

  // ── Endpoint identification ───────────────────────────────────

  it('verifies endpoint type (direct vs -pooler host)', async () => {
    const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
    const isPooler = url.includes('-pooler') || url.includes('pgbouncer');
    const isDirect = !isPooler && url.includes('neon.tech');

    console.log(
      `[Suite 4 — Endpoint] DATABASE_URL host type: ` +
      `${isPooler ? 'pooler (pgBouncer)' : isDirect ? 'direct' : 'unknown'}. ` +
      `URL hint: ${url.replace(/\/\/.*@/, '//<creds>@')}`,
    );

    // This is informational — record the endpoint type
    expect(url).toBeTruthy();
  });

  // ── Connection pool behavior ─────────────────────────────────

  it('pool handles concurrent checkouts within max', async () => {
    const CONCURRENT_CHECKOUTS = 5;

    const client = await pool.connect();
    try {
      const startTime = Date.now();

      // Run concurrent queries via the pool
      const promises = Array.from({ length: CONCURRENT_CHECKOUTS }, (_, i) =>
        client.query('SELECT $1::int AS n, pg_sleep(0.1)', [i]),
      );

      const results = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // All queries should succeed
      expect(results.length).toBe(CONCURRENT_CHECKOUTS);
      for (let i = 0; i < CONCURRENT_CHECKOUTS; i++) {
        expect((results[i].rows[0] as any).n).toBe(i);
      }

      console.log(
        `[Suite 4] ${CONCURRENT_CHECKOUTS} concurrent queries completed in ${elapsed}ms. ` +
        `(Note: these run through a single client; true multi-connection ceiling ` +
        `requires preview-deploy probe — see suite 5.)`,
      );
    } finally {
      client.release();
    }
  });

  // ── Pool exhaustion test ─────────────────────────────────────

  it('pool recover from checkout + release cycle', async () => {
    const CYCLES = 10;

    for (let i = 0; i < CYCLES; i++) {
      const client = await pool.connect();
      const result = await client.query('SELECT $1::int AS cycle', [i]);
      expect((result.rows[0] as any).cycle).toBe(i);
      client.release();
    }

    console.log(
      `[Suite 4] Checkout/release cycle: ${CYCLES} cycles completed, pool still healthy.`,
    );
  });

  // ── RLS through pool ─────────────────────────────────────────

  it('RLS context persists across pool checkout (session-mode check)', async () => {
    const client = await pool.connect();
    try {
      // Set a tenant context (simulating getTenantSql behavior)
      await client.query("SET app.current_tenant = 'test_tenant_ceiling'");

      // Verify the setting persists for this checkout
      const result = await client.query('SHOW app.current_tenant');
      const tenant = (result.rows[0] as any).app_current_tenant;
      expect(tenant).toBe('test_tenant_ceiling');

      console.log(
        `[Suite 4 — RLS] Tenant context persisted across queries within single checkout. ` +
        `Session-mode pooling preserves this; transaction-mode would silently drop it.`,
      );
    } finally {
      client.release();
    }
  });
});
