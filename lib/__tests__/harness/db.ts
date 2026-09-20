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

/**
 * Check whether a test database is configured.
 * Use this to skip heavy suites when TEST_DATABASE_URL is not set.
 */
export function hasTestDatabase(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL);
}

/**
 * Returns the TEST_DATABASE_URL if configured, for conditional test skipping.
 */
export function getTestDatabaseUrl(): string | undefined {
  return process.env.TEST_DATABASE_URL;
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
 * Falls back gracefully when superuser is unavailable (Neon).
 */
export async function truncateTables(pool: Pool, tables: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    // Try fast path first (requires superuser — may fail on Neon)
    let fastPath = true;
    try {
      await client.query('SET session_replication_role = replica');
    } catch {
      fastPath = false;
    }

    if (fastPath) {
      try {
        for (const table of tables) {
          await client.query(`TRUNCATE TABLE ${table} CASCADE`);
        }
      } finally {
        await client.query('SET session_replication_role = DEFAULT');
      }
    } else {
      // No superuser — truncate in reverse order so FKs don't block.
      // CASCADE handles any remaining dependencies.
      for (const table of [...tables].reverse()) {
        await client.query(`TRUNCATE TABLE ${table} CASCADE`);
      }
    }
  } finally {
    client.release();
  }
}
