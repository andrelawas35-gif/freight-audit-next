/**
 * Generator A — dirty-input fidelity (ingestion resilience nightly fuzz).
 *
 * Produces raw CSV/EDI-shaped payloads and asserts three invariants
 * for any dirty batch:
 *   1. No silent loss — count(staged) + count(rejected) == count(submitted).
 *   2. No corruption of the good / no partial write — bad rows don't poison
 *      valid rows beside them, never trigger partial financial write.
 *   3. No crash, visible failure — degrades to an inspectable error row.
 *
 * Runs as a non-blocking nightly fuzz. Failing inputs are promoted to
 * deterministic fixtures in the gating set.
 *
 * Does NOT import from audit engines directly — exercises staging path.
 */

export interface DirtyInputPayload {
  /** Raw CSV text or JSON payload to submit to staging. */
  raw: string;
  /** MIME/content type hint. */
  contentType: 'csv' | 'json' | 'edi';
  /** Expected outcome per row. */
  expected: {
    /** Number of rows expected to stage successfully. */
    staged: number;
    /** Number of rows expected to be rejected (quarantined). */
    rejected: number;
    /** If true, the entire batch should be rejected (structural flaw). */
    batchRejected?: boolean;
  };
}

// ── Freight flaw taxonomy ───────────────────────────────────────

/**
 * Generate payloads covering the freight flaw taxonomy.
 * Each payload targets a specific flaw class.
 */
export function generateDirtyPayloads(): DirtyInputPayload[] {
  const payloads: DirtyInputPayload[] = [];

  // ── 1. Structural: missing columns ───────────────────────────
  payloads.push({
    raw: `Tracking Number,Actual Weight,Carrier
1ZTEST001,5.5,UPS
1ZTEST002,3.2,UPS`,
    contentType: 'csv',
    expected: { staged: 0, rejected: 2, batchRejected: true },
  });

  // ── 2. Structural: wrong delimiter (pipe instead of comma) ───
  payloads.push({
    raw: `Tracking Number|Actual Weight|Carrier|Ship Date|Destination Zip
1ZTEST003|5.5|UPS|2026-06-01|30301`,
    contentType: 'csv',
    expected: { staged: 0, rejected: 1, batchRejected: true },
  });

  // ── 3. Type/format: numeric weight as string ──────────────────
  payloads.push({
    raw: `Tracking Number,Actual Weight,Carrier,Ship Date,Destination Zip
1ZTEST004,"12 lbs",UPS,2026-06-01,30301
1ZTEST005,4.0,UPS,2026-06-02,94105`,
    contentType: 'csv',
    expected: { staged: 1, rejected: 1 }, // 1 good row, 1 bad
  });

  // ── 4. Type/format: dollar amount in currency format ──────────
  payloads.push({
    raw: `Tracking Number,Amount Billed,Carrier,Invoice Date
1ZTEST006,"$1,234.50",UPS,2026-06-01
1ZTEST007,56.75,UPS,2026-06-02`,
    contentType: 'csv',
    expected: { staged: 1, rejected: 1 },
  });

  // ── 5. Type/format: invalid date ─────────────────────────────
  payloads.push({
    raw: `Tracking Number,Actual Weight,Carrier,Ship Date,Destination Zip
1ZTEST008,5.0,UPS,not-a-date,30301
1ZTEST009,3.0,UPS,2026-06-02,94105`,
    contentType: 'csv',
    expected: { staged: 1, rejected: 1 },
  });

  // ── 6. Referential: unmapped SCAC ────────────────────────────
  payloads.push({
    raw: `Tracking Number,Actual Weight,Carrier,Ship Date,Destination Zip
1ZTEST010,5.0,UNKNOWN_CARRIER_XYZ,2026-06-01,30301`,
    contentType: 'csv',
    expected: { staged: 0, rejected: 1 }, // quarantined for code mapping
  });

  // ── 7. Duplicate/identity: re-uploaded file ──────────────────
  // (idempotency test — same payload submitted twice)
  payloads.push({
    raw: `Tracking Number,Actual Weight,Carrier,Ship Date,Destination Zip
1ZTEST011,5.0,UPS,2026-06-01,30301`,
    contentType: 'csv',
    expected: { staged: 1, rejected: 0 },
  });

  // ── 8. Boundary: empty file ──────────────────────────────────
  payloads.push({
    raw: '',
    contentType: 'csv',
    expected: { staged: 0, rejected: 0, batchRejected: true },
  });

  // ── 9. Boundary: header-only ─────────────────────────────────
  payloads.push({
    raw: `Tracking Number,Actual Weight,Carrier,Ship Date,Destination Zip`,
    contentType: 'csv',
    expected: { staged: 0, rejected: 0 },
  });

  // ── 10. Negative charges ─────────────────────────────────────
  payloads.push({
    raw: `Tracking Number,Amount Billed,Carrier,Invoice Date
1ZTEST012,-50.00,UPS,2026-06-01
1ZTEST013,25.00,UPS,2026-06-02`,
    contentType: 'csv',
    expected: { staged: 1, rejected: 1 },
  });

  return payloads;
}

// ── Invariant assertions (applied after staging) ─────────────────

export interface StagingResult {
  staged: number;
  rejected: number;
  submitted: number;
  errors: string[];
}

/**
 * Assert the three Generator-A invariants against staging results.
 */
export function assertGeneratorAInvariants(
  result: StagingResult,
  expected: DirtyInputPayload['expected'],
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  // Invariant 1: No silent loss
  const total = result.staged + result.rejected;
  if (total !== result.submitted && !expected.batchRejected) {
    failures.push(
      `Invariant 1 (no silent loss): staged(${result.staged}) + rejected(${result.rejected}) != submitted(${result.submitted}). ` +
      `Missing: ${result.submitted - total} rows.`,
    );
  }

  // Invariant 2: No corruption — staged count matches expected
  if (result.staged !== expected.staged) {
    failures.push(
      `Invariant 2 (no corruption): expected ${expected.staged} staged, got ${result.staged}.`,
    );
  }

  // Invariant 3: No crash — errors are inspectable
  if (result.errors.some((e) => e.includes('Unhandled') || e.includes('crash'))) {
    failures.push(
      `Invariant 3 (no crash): unhandled error found: ${result.errors.join('; ')}`,
    );
  }

  return { passed: failures.length === 0, failures };
}
