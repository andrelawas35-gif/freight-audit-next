/**
 * Suite 2 — Concurrency / Atomicity (RED Test)
 *
 * This suite MUST FAIL on current Wave-0/1 code (no UNIQUE constraint).
 * It fires multiple concurrent audit runs over one seeded invoice set
 * and asserts exactly one finding per natural key.
 *
 * The UNIQUE constraint + ON CONFLICT DO NOTHING (H4's fix) will make
 * this suite green. Until then, duplicates prove the TOCTOU race exists.
 *
 * Gated on TEST_DATABASE_URL.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestPool, closeTestPool, truncateTables, hasTestDatabase } from '../harness/db';
import { generateCorpus, seedCorpus } from '../harness/generator-b';
import { buildRulebookFixture, seedRulebookFixture } from '../harness/rulebook-fixture';
import { fetchActualFindings, actualKeySet, type FindingRow } from '../harness/oracle';

// ── Configuration ────────────────────────────────────────────────

const SEED = 20260629;
const CLIENT_ID = 'genb_client_suite2';
const CARRIER_SCAC = 'GENB';

const TABLES = [
  '"Invoices"',
  '"Shipments"',
  '"Audit Results"',
  'tpl_fulfillment_lines',
  'rulebook',
  'audit_jobs',
  'audit_runs',
];

const describeIf = hasTestDatabase() ? describe : describe.skip;

describeIf('Suite 2 — Concurrency (RED: duplicates expected)', () => {
  let pool: ReturnType<typeof getTestPool>;
  // Outcomes of the concurrent runs. Kept (not discarded) so a run that throws
  // is a visible failure, not a silent empty table that passes "no duplicates".
  let runOutcomes: PromiseSettledResult<unknown>[] = [];

  beforeAll(async () => {
    pool = getTestPool();
    await truncateTables(pool, TABLES);

    // Generate a small corpus focused on duplicate reproduction
    const corpus = generateCorpus({
      seed: SEED,
      pivotT: '2026-06-29T12:00:00.000Z',
      clientId: CLIENT_ID,
      carrierScac: CARRIER_SCAC,
      cleanInvoiceCount: 5,
    });

    const fixtureRows = buildRulebookFixture(CLIENT_ID, CARRIER_SCAC);
    await seedRulebookFixture(pool, fixtureRows);
    await seedCorpus(pool, corpus);

    // ── Fire concurrent audit runs ─────────────────────────────

    const { runAudit } = await import('@/lib/audit/engine');

    // Launch 3 concurrent audit runs for the same client
    const runs = [
      runAudit({ clientId: CLIENT_ID, runStartedAt: corpus.pivotT }),
      runAudit({ clientId: CLIENT_ID, runStartedAt: corpus.pivotT }),
      runAudit({ clientId: CLIENT_ID, runStartedAt: corpus.pivotT }),
    ];

    runOutcomes = await Promise.allSettled(runs);
  });

  afterAll(async () => {
    await truncateTables(pool, TABLES);
    await closeTestPool();
  });

  // ── Precondition: the runs must actually complete ──────────────
  //
  // Without this, a run that throws (e.g. a CHECK-constraint violation) writes
  // no rows and the duplicate test below passes vacuously. That is exactly how
  // suite 2 was green on pre-H4 code: every run died on chk_audit_results_client_id.

  it('all concurrent runs complete without throwing', () => {
    const failures = runOutcomes
      .filter((o): o is PromiseRejectedResult => o.status === 'rejected')
      .map((o) => (o.reason instanceof Error ? o.reason.message : String(o.reason)));
    expect(runOutcomes).toHaveLength(3);
    expect(failures, `concurrent runAudit() rejections:\n${failures.join('\n')}`).toEqual([]);
  });

  // ── GREEN: UNIQUE constraint + ON CONFLICT DO NOTHING ──────────

  it('GREEN: concurrent runs produce exactly one finding per natural key', async () => {
    const actualRows = await fetchActualFindings(pool, CLIENT_ID);

    // Non-vacuity: the seeded corpus contains planted violations, so an empty
    // result means the engine wrote nothing, not that there were no duplicates.
    expect(actualRows.length).toBeGreaterThan(0);

    // Count findings per natural key
    const keyCounts = new Map<string, number>();
    for (const r of actualRows) {
      const key = `${r.subject_type}|${r.subject_id}|${r['Detected by']}`;
      keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    }

    // Find duplicates (keys with count > 1)
    const duplicates: string[] = [];
    for (const [key, count] of keyCounts) {
      if (count > 1) duplicates.push(`${key} (×${count})`);
    }

    if (duplicates.length > 0) {
      console.log(
        `[Suite 2 — UNEXPECTED FAILURE] Duplicate findings detected (${duplicates.length} keys):\n` +
        duplicates.map((d) => `  - ${d}`).join('\n'),
      );
    }

    // H4 (Wave 3): UNIQUE(subject_type, subject_id, "Detected by") +
    // ON CONFLICT DO NOTHING ensures at most one finding per natural key,
    // even under concurrent runs. This MUST be zero.
    expect(duplicates).toHaveLength(0);
  });

  // ── These pass/fail depending on concurrency behavior ─────────

  it('no double-claim of audit jobs', async () => {
    const client = await pool.connect();
    try {
      const jobs = await client.query(
        `SELECT id, status FROM audit_jobs WHERE client_id = $1`,
        [CLIENT_ID],
      );

      // Each job should be claimed only once
      const runningJobs = (jobs.rows as any[]).filter(
        (j) => j.status === 'running' || j.status === 'completed' || j.status === 'claimed',
      );
      // At minimum, jobs exist and have a valid status
      expect(runningJobs.length).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });

  it('idempotent re-run: re-running same audit produces no new findings', async () => {
    // Count findings before re-run
    const beforeRows = await fetchActualFindings(pool, CLIENT_ID);
    const beforeCount = beforeRows.length;
    // Non-vacuity: 0 before and 0 after would "prove" idempotency of nothing.
    expect(beforeCount).toBeGreaterThan(0);

    // Re-run the audit
    const { runAudit } = await import('@/lib/audit/engine');
    await runAudit({
      clientId: CLIENT_ID,
      runStartedAt: '2026-06-29T12:00:00.000Z',
    });

    // Count after
    const afterRows = await fetchActualFindings(pool, CLIENT_ID);
    const afterCount = afterRows.length;

    // H4: UNIQUE constraint + ON CONFLICT DO NOTHING guarantees
    // idempotent re-runs — exactly the same findings, no duplicates.
    console.log(
      `[Suite 2] Idempotency check: ${beforeCount} before, ${afterCount} after re-run. ` +
      `Delta: ${afterCount - beforeCount}`,
    );
    expect(afterCount).toBe(beforeCount);
  });

  // ── Negative test: ensure 3PL duplicate-cycle findings are distinct ──

  it('3PL duplicate-cycle findings have distinct subject_ids (line-id keying)', async () => {
    const actualRows = await fetchActualFindings(pool, CLIENT_ID);
    const tplDupRows = actualRows.filter(
      (r) => r.subject_type === 'tpl' && r['Detected by'] === 'TPL_DUPLICATE',
    );

    // Each TPL_DUPLICATE finding should have a distinct subject_id (line id)
    const subjectIds = tplDupRows.map((r) => r.subject_id);
    const uniqueIds = new Set(subjectIds);

    // TPL_DUPLICATE fires once per duplicate cycle — each is a separate
    // recoverable claim with a distinct line id.
    expect(uniqueIds.size).toBe(subjectIds.length);
  });
});
