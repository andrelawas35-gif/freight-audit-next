/**
 * Heavy-testing harness: schema-snapshot guard.
 *
 * Introspects information_schema on the provisioned test branch and
 * fails fast with a readable diff if the live column/constraint set
 * drifts from what the generator targets.
 *
 * Catches a removed/renamed column before a cryptic insert error
 * 200K rows deep — and guards against a migration landing between
 * harness-write and test-read.
 */

import type { Pool } from '@neondatabase/serverless';

export interface ColumnInfo {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: string;
  columnDefault: string | null;
}

export interface ConstraintInfo {
  tableName: string;
  constraintName: string;
  constraintType: string;
}

export interface SchemaSnapshot {
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  capturedAt: string;
}

let _snapshot: SchemaSnapshot | null = null;

/**
 * Capture the current schema from information_schema.
 * Call once per test run, after provisioning.
 */
export async function captureSchemaSnapshot(connectionString: string): Promise<SchemaSnapshot> {
  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    const columnsRes = await client.query(`
      SELECT table_name   AS "tableName",
             column_name  AS "columnName",
             data_type    AS "dataType",
             is_nullable  AS "isNullable",
             column_default AS "columnDefault"
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name NOT LIKE '_%'
       ORDER BY table_name, ordinal_position
    `);

    const constraintsRes = await client.query(`
      SELECT tc.table_name       AS "tableName",
             tc.constraint_name  AS "constraintName",
             tc.constraint_type  AS "constraintType"
        FROM information_schema.table_constraints tc
       WHERE tc.table_schema = 'public'
         AND tc.table_name NOT LIKE '_%'
       ORDER BY tc.table_name, tc.constraint_name
    `);

    _snapshot = {
      columns: columnsRes.rows as ColumnInfo[],
      constraints: constraintsRes.rows as ConstraintInfo[],
      capturedAt: new Date().toISOString(),
    };

    return _snapshot;
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Assert the current schema matches a previously captured snapshot.
 * Fails with a human-readable diff if columns or constraints have drifted.
 */
export function assertSchemaMatches(expected: SchemaSnapshot, actual: SchemaSnapshot): void {
  const diffs: string[] = [];

  // Build lookup sets
  const expectedCols = new Set(expected.columns.map(c => `${c.tableName}.${c.columnName}`));
  const actualCols = new Set(actual.columns.map(c => `${c.tableName}.${c.columnName}`));

  for (const col of expectedCols) {
    if (!actualCols.has(col)) diffs.push(`MISSING column: ${col}`);
  }
  for (const col of actualCols) {
    if (!expectedCols.has(col)) diffs.push(`UNEXPECTED column: ${col}`);
  }

  // Check constraints
  const expectedCons = new Set(expected.constraints.map(c => `${c.tableName}.${c.constraintName} (${c.constraintType})`));
  const actualCons = new Set(actual.constraints.map(c => `${c.tableName}.${c.constraintName} (${c.constraintType})`));

  for (const con of expectedCons) {
    if (!actualCons.has(con)) diffs.push(`MISSING constraint: ${con}`);
  }

  if (diffs.length > 0) {
    throw new Error(
      `Schema drift detected between snapshot (${expected.capturedAt}) and current (${actual.capturedAt}):\n` +
      diffs.map(d => `  - ${d}`).join('\n'),
    );
  }
}
