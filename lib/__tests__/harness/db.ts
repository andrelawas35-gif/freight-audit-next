/**
 * Heavy-testing harness: database gate and helpers.
 *
 * All heavy suites import from here to get a provisioned, isolated
 * test database connection.  This module:
 *   1. Gates on TEST_DATABASE_URL (hard fail if missing in CI).
 *   2. Exposes a pg Pool for direct SQL seeding/assertion.
 *   3. Provides TRUNCATE helpers for suite isolation.
 */

import { Pool } from '@neondatabase/serverless';

/** Thrown when TEST_DATABASE_URL is not set in a CI environment. */
export class MissingTestDatabaseError extends Error {
  constructor() {
    super(
      'TEST_DATABASE_URL is required for heavy-testing suites. ' +
      'Set it to a Neon branch connection string (local dev: a dedicated test db; ' +
      'CI: provisioned by the harness or pre-provisioned branch).',
    );
    this.name = 'MissingTestDatabaseError';
  }
}

let _pool: Pool | null = null;

/**
 * Returns a pg Pool connected to the test database.
 * Lazy-initializes once per process.
 */
export function getTestPool(): Pool {
  if (_pool) return _pool;

  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new MissingTestDatabaseError();

  _pool = new Pool({ connectionString: url, max: 4 });
  return _pool;
}

/**
 * Release the test pool. Call in global teardown.
 */
export async function closeTestPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

/**
 * Truncate a set of tables between suites for isolation.
 * Uses CASCADE to handle FK dependencies.
 */
export async function truncateTables(pool: Pool, tables: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    // Disable FK triggers temporarily for fast multi-table truncation
    await client.query('SET session_replication_role = replica');
    for (const table of tables) {
      await client.query(`TRUNCATE TABLE ${table} CASCADE`);
    }
    await client.query('SET session_replication_role = DEFAULT');
  } finally {
    client.release();
  }
}
