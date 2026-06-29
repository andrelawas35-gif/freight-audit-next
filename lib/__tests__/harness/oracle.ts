/**
 * Ground-truth oracle — planted expected-finding set keyed on the
 * finding natural key `(subject_type, subject_id, "Detected by")`.
 *
 * Used by suite 1 for set-equality assertions and by suite 2 for
 * dedup verification.  The oracle is built from the generator's
 * `expectedFindings` array and compared against actual audit results
 * queried from the database.
 */

import type { Pool } from '@neondatabase/serverless';

/** A finding identified by its natural key. */
export interface FindingKey {
  subjectType: string;
  subjectId: string;
  detectedBy: string;
}

/** A full finding row from "Audit Results" (subset of columns). */
export interface FindingRow {
  id: string;
  subject_type: string;
  subject_id: string;
  'Detected by': string;
  'Variance': number;
  'Outcome': string;
  'Gateway preventability': string;
  'Gateway category': string;
  'Gateway rule suggestion': string | null;
}

// ── Key helpers ──────────────────────────────────────────────────

/** Canonical string representation of a finding key for set operations. */
export function keyString(k: FindingKey): string {
  return `${k.subjectType}|${k.subjectId}|${k.detectedBy}`;
}

/** Parse a key string back into a FindingKey. */
export function parseKey(s: string): FindingKey {
  const [subjectType, subjectId, detectedBy] = s.split('|');
  return { subjectType, subjectId, detectedBy };
}

/** Build an expected-key set from the generator's planted findings. */
export function expectedKeySet(
  expected: { subjectType: string; subjectId: string; detectedBy: string }[],
): Set<string> {
  return new Set(expected.map((f) => keyString(f)));
}

// ── Database queries ─────────────────────────────────────────────

/**
 * Fetch actual findings from the database for a given run.
 * Returns rows keyed by the natural key for set comparison.
 */
export async function fetchActualFindings(
  pool: Pool,
  clientId: string,
): Promise<FindingRow[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, subject_type, subject_id, "Detected by", "Variance", "Outcome",
              "Gateway preventability", "Gateway category", "Gateway rule suggestion"
         FROM "Audit Results"
        WHERE "Client" @> $1::text[]
        ORDER BY subject_type, subject_id, "Detected by"`,
      [[clientId]],
    );
    return result.rows as FindingRow[];
  } finally {
    client.release();
  }
}

/**
 * Build a set of actual finding keys from database rows.
 */
export function actualKeySet(rows: FindingRow[]): Set<string> {
  return new Set(
    rows.map((r) => keyString({
      subjectType: r.subject_type,
      subjectId: r.subject_id,
      detectedBy: r['Detected by'],
    })),
  );
}

// ── Set comparison ───────────────────────────────────────────────

export interface SetDiff {
  /** Keys in expected but not in actual (missing findings). */
  missing: string[];
  /** Keys in actual but not in expected (extra/spurious findings). */
  extra: string[];
  /** Keys present in both (OK). */
  matched: number;
}

/**
 * Compare expected vs actual finding sets.
 */
export function diffFindings(
  expected: Set<string>,
  actual: Set<string>,
): SetDiff {
  const missing: string[] = [];
  const extra: string[] = [];
  let matched = 0;

  for (const k of expected) {
    if (actual.has(k)) {
      matched++;
    } else {
      missing.push(k);
    }
  }
  for (const k of actual) {
    if (!expected.has(k)) {
      extra.push(k);
    }
  }

  return { missing, extra, matched };
}

/**
 * Format a set diff as a human-readable string for test failure messages.
 */
export function formatDiff(diff: SetDiff): string {
  const lines: string[] = [];
  lines.push(`Matched: ${diff.matched}`);
  if (diff.missing.length) {
    lines.push(`Missing (${diff.missing.length}):`);
    for (const k of diff.missing) lines.push(`  - ${k}`);
  }
  if (diff.extra.length) {
    lines.push(`Extra (${diff.extra.length}):`);
    for (const k of diff.extra) lines.push(`  + ${k}`);
  }
  return lines.join('\n');
}

// ── Reconciliation (summed in SQL, integer cents) ────────────────

/**
 * Sum variances from "Audit Results" in SQL (integer cents via numeric).
 * Returns as a float but the comparison should be done in cents.
 */
export async function sumVarianceSql(
  pool: Pool,
  clientId: string,
): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT COALESCE(SUM("Variance"), 0) AS total
         FROM "Audit Results"
        WHERE "Client" @> $1::text[]`,
      [[clientId]],
    );
    return parseFloat((result.rows[0] as any).total);
  } finally {
    client.release();
  }
}

/** Convert dollars to integer cents for exact comparison. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}
