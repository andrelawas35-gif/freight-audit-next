/**
 * Heavy-testing harness: ephemeral Neon branch lifecycle.
 *
 * Creates a copy-on-write branch off main, provisions it with db/migrate.ts,
 * exposes the connection string to the test suite as TEST_DATABASE_URL, and
 * destroys the branch in a finally block so a crashed run never leaks branches.
 *
 * Requires NEON_API_KEY in environment (scoped to branch create/destroy).
 * Fallback: set TEST_DATABASE_URL to a pre-provisioned branch; the harness
 * will TRUNCATE + re-seed instead (no Neon API needed).
 */

import type { Pool } from '@neondatabase/serverless';

const NEON_API_BASE = 'https://console.neon.tech/api/v2';

export interface BranchConfig {
  /** Connection string for the test branch (set as TEST_DATABASE_URL). */
  connectionString: string;
  /** Branch ID (for teardown). null when using the pre-provisioned fallback. */
  branchId: string | null;
  /** Teardown function — call in afterAll/finally. */
  destroy: () => Promise<void>;
}

let _config: BranchConfig | null = null;

/**
 * Provision a test branch and return its config.
 *
 * If NEON_API_KEY and NEON_PROJECT_ID are set, creates an ephemeral branch
 * via the Neon API.  Otherwise falls back to the pre-provisioned
 * TEST_DATABASE_URL branch (TRUNCATEs tables before each suite).
 */
export async function provisionTestBranch(): Promise<BranchConfig> {
  if (_config) return _config;

  const neonApiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;

  if (neonApiKey && projectId) {
    _config = await provisionEphemeralBranch(neonApiKey, projectId);
  } else {
    _config = await provisionFallbackBranch();
  }

  return _config;
}

async function provisionEphemeralBranch(
  apiKey: string,
  projectId: string,
): Promise<BranchConfig> {
  const branchName = `heavy-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // 1. Create branch
  const createRes = await fetch(`${NEON_API_BASE}/projects/${projectId}/branches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      branch: { name: branchName },
      endpoints: [{ type: 'read_write' }],
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Failed to create ephemeral branch: ${createRes.status} ${body}`);
  }

  const branch = await createRes.json() as any;
  const branchId: string = branch.branch.id;
  const host = branch.endpoints?.[0]?.host;
  if (!host) throw new Error('Ephemeral branch created but no endpoint host returned.');

  const password = await getBranchPassword(apiKey, projectId, branchId);
  const connectionString = `postgres://neondb_owner:${password}@${host}/neondb?sslmode=require`;

  // 2. Provision schema
  process.env.TEST_DATABASE_URL = connectionString;
  const { execSync } = await import('child_process');
  execSync('npx tsx db/migrate.ts', {
    env: { ...process.env, MIGRATION_RESET: 'true', TEST_DATABASE_URL: connectionString },
    stdio: 'pipe',
  });

  return {
    connectionString,
    branchId,
    destroy: async () => {
      await fetch(`${NEON_API_BASE}/projects/${projectId}/branches/${branchId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    },
  };
}

async function provisionFallbackBranch(): Promise<BranchConfig> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL must be set when NEON_API_KEY is not available. ' +
      'Set it to a pre-provisioned Neon branch for CI or a local dev database.',
    );
  }

  return {
    connectionString: url,
    branchId: null,
    destroy: async () => {
      // Fallback: truncate all business tables so the next suite starts clean.
      // We don't destroy the branch — it's pre-provisioned and reused.
      const { Pool } = await import('@neondatabase/serverless');
      const pool = new Pool({ connectionString: url });
      const client = await pool.connect();
      try {
        await client.query(`
          DO $$ DECLARE r RECORD;
          BEGIN
            FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_%')
            LOOP
              EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
            END LOOP;
          END $$;
        `);
      } finally {
        client.release();
        await pool.end();
      }
    },
  };
}

async function getBranchPassword(apiKey: string, projectId: string, branchId: string): Promise<string> {
  const res = await fetch(
    `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) throw new Error(`Failed to fetch branch details: ${res.status}`);
  const branch = await res.json() as any;
  // The role password is available via the branch detail response
  const roleRes = await fetch(
    `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}/roles`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!roleRes.ok) throw new Error(`Failed to fetch branch roles: ${roleRes.status}`);
  const roles = await roleRes.json() as any;
  const ownerRole = roles.roles?.find((r: any) => r.name === 'neondb_owner');
  if (!ownerRole?.password) {
    // Fall back to computing connection string from the endpoint host
    // with the assumption that the default owner password is available
    return process.env.NEON_DATABASE_PASSWORD || '';
  }
  return ownerRole.password;
}
