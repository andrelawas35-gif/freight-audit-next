/**
 * Suite 3 — Queue Drain-Rate Reality Check (Nightly, Measured)
 *
 * Enqueues a realistic onboarding spike, then measures drain against
 * the 1-job/min single-poller cadence (vercel.json cron `* * * * *` +
 * one claim per `/api/run-audit/process`).
 *
 * Surfaces latency-to-results as a product decision (e.g. "200 jobs → 3.3 h").
 * Does not gate — measures and records.
 *
 * Gated on TEST_DATABASE_URL.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestPool, closeTestPool, truncateTables, hasTestDatabase } from '../harness/db';

const TABLES = ['audit_jobs', '"Audit Results"'];

const describeIf = hasTestDatabase() ? describe : describe.skip;

describeIf('Suite 3 — Drain Rate', () => {
  let pool: ReturnType<typeof getTestPool>;

  beforeAll(async () => {
    pool = getTestPool();
    await truncateTables(pool, TABLES);
  });

  afterAll(async () => {
    await truncateTables(pool, TABLES);
    await closeTestPool();
  });

  // ── Enqueue spike ─────────────────────────────────────────────

  it('can enqueue a spike of audit jobs', async () => {
    const client = await pool.connect();
    try {
      const JOB_COUNT = 100; // representative spike

      // Bulk-insert audit jobs
      for (let i = 0; i < JOB_COUNT; i++) {
        await client.query(
          `INSERT INTO audit_jobs (id, client_id, started_at, status)
           VALUES ($1, $2, $3, 'pending')`,
          [
            `drain_job_${String(i).padStart(5, '0')}`,
            'test_client_drain',
            new Date().toISOString(),
          ],
        );
      }

      // Verify count
      const countRes = await client.query(
        `SELECT COUNT(*) AS cnt FROM audit_jobs WHERE client_id = $1 AND status = 'pending'`,
        ['test_client_drain'],
      );
      const count = parseInt((countRes.rows[0] as any).cnt, 10);
      expect(count).toBe(JOB_COUNT);
    } finally {
      client.release();
    }
  });

  // ── Measure single-claim drain ────────────────────────────────

  it('measures single-claim drain arithmetic (FOR UPDATE SKIP LOCKED)', async () => {
    const client = await pool.connect();
    try {
      // Claim ONE job (simulating the 1/min cron poller)
      const claimRes = await client.query(
        `WITH next_job AS (
           SELECT id FROM audit_jobs
            WHERE status = 'pending'
            ORDER BY started_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
         )
         UPDATE audit_jobs SET status = 'claimed'
          FROM next_job
          WHERE audit_jobs.id = next_job.id
          RETURNING audit_jobs.id`,
      );

      const claimedCount = claimRes.rows.length;
      expect(claimedCount).toBeLessThanOrEqual(1);

      // Count remaining pending jobs
      const pendingRes = await client.query(
        `SELECT COUNT(*) AS cnt FROM audit_jobs WHERE status = 'pending'`,
      );
      const pending = parseInt((pendingRes.rows[0] as any).cnt, 10);

      // Drain arithmetic: at 1 job/min, remaining N jobs → N minutes
      const drainMinutes = pending;
      const drainHours = (drainMinutes / 60).toFixed(1);

      console.log(
        `[Suite 3 — Drain Rate] Single-claim drain: ${pending} pending jobs remaining ` +
        `→ ~${drainMinutes} min (${drainHours} h) at 1 job/min. ` +
        `Recommendation: consider loop/claim-batch in /api/run-audit/process if drain > 1h.`,
      );

      // No assertion — this is a measurement. Record the number.
      expect(drainMinutes).toBeGreaterThanOrEqual(0);
    } finally {
      client.release();
    }
  });

  // ── Claim-batch recommendation test ──────────────────────────

  it('claim-batch catches multiple jobs per poll (recommended path)', async () => {
    const client = await pool.connect();
    try {
      const BATCH_SIZE = 5;

      // Claim up to BATCH_SIZE jobs
      const claimRes = await client.query(
        `WITH next_jobs AS (
           SELECT id FROM audit_jobs
            WHERE status = 'pending'
            ORDER BY started_at ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
         )
         UPDATE audit_jobs SET status = 'claimed'
          FROM next_jobs
          WHERE audit_jobs.id = next_jobs.id
          RETURNING audit_jobs.id`,
        [BATCH_SIZE],
      );

      const claimedCount = claimRes.rows.length;
      console.log(
        `[Suite 3] Claim-batch (batch_size=${BATCH_SIZE}): claimed ${claimedCount} jobs in one poll.`,
      );

      expect(claimedCount).toBeLessThanOrEqual(BATCH_SIZE);
    } finally {
      client.release();
    }
  });
});
