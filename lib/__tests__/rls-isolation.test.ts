/**
 * RLS Isolation — Negative Test Suite
 *
 * Two tiers:
 *   1. Static policy lint (always runs) — parses migration SQL to confirm
 *      RLS CREATE POLICY, ENABLE, and FORCE statements exist for every
 *      protected table.  Fast, no DB needed.
 *   2. Behavioral integration test (gated on TEST_DATABASE_URL) — connects
 *      as app_tenant, asserts 0 rows with no tenant context, seeds tenant
 *      A/B rows, and verifies A cannot read B (and vice versa).
 *
 * Contract (data-protection.md D5):
 *   1. Connect as app_tenant with NO app.current_tenant set → every protected
 *      query returns 0 rows.
 *   2. Set tenant A → cannot see a seeded tenant-B row, and vice versa.
 *   3. A broken or missing policy fails the build.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from '@neondatabase/serverless';

// ── Migration file paths ──────────────────────────────────────────

const MIG_0006_PATH = join(__dirname, '..', '..', 'db', 'migrations', '0006_keystone_contract.sql');
const MIG_0018_PATH = join(__dirname, '..', '..', 'db', 'migrations', '0018_rls_rollout_portal_read_set.sql');

function readMigration(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

const migration0006 = readMigration(MIG_0006_PATH);
const migration0018 = readMigration(MIG_0018_PATH);
const combinedMigrations = migration0006 + '\n' + migration0018;

// ── Policy existence tests (parse the migration SQL) ────────────────

const PHASE_1_TABLES = [
  { table: '"Invoices"',                tenancy: 'scalar', column: 'client_id' },
  { table: '"Audit Results"',           tenancy: 'scalar', column: 'client_id' },
  { table: '"Disputes"',                tenancy: 'scalar', column: 'client_id' },
  { table: 'client_insurance_policies', tenancy: 'scalar', column: 'client_id' },
  { table: 'insurance_policy_rules',    tenancy: 'scalar', column: 'client_id' },
  { table: 'policy_rules',              tenancy: 'scalar', column: 'client_id' },
  { table: 'policy_documents',          tenancy: 'scalar', column: 'client_id' },
  { table: 'client_policies',           tenancy: 'scalar', column: 'client_id' },
  { table: 'gateway_decisions',         tenancy: 'scalar', column: 'client_id' },
] as const;

// Portal read-set tables added by 0018 (ADR 0013 Decision 3)
const PORTAL_READ_SET_TABLES = [
  { table: '"Clients"',                tenancy: 'own-row', column: 'id' },
  { table: 'policy_rulesets',          tenancy: 'scalar',  column: 'client_id' },
  { table: 'policy_scope_exclusions',  tenancy: 'scalar',  column: 'client_id' },
] as const;

describe('RLS Policy Definitions (migration parse)', () => {
  it('migration file 0006_keystone_contract.sql exists', () => {
    expect(migration0006).toBeTruthy();
    expect(migration0006.length).toBeGreaterThan(100);
  });

  it('migration file 0018_rls_rollout_portal_read_set.sql exists', () => {
    expect(migration0018).toBeTruthy();
    expect(migration0018.length).toBeGreaterThan(100);
  });

  for (const { table } of PHASE_1_TABLES) {
    it(`${table} has RLS ENABLED`, () => {
      const pattern = new RegExp(
        `ALTER\\s+TABLE\\s+${table.replace(/"/g, '"?')}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      expect(combinedMigrations).toMatch(pattern);
    });

    it(`${table} has FORCE ROW LEVEL SECURITY`, () => {
      const pattern = new RegExp(
        `ALTER\\s+TABLE\\s+${table.replace(/"/g, '"?')}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      expect(migration0006).toMatch(pattern);
    });

    it(`${table} has a tenant isolation policy`, () => {
      const policyName = table.replace(/"/g, '').replace(/\s+/g, '_').toLowerCase();
      expect(combinedMigrations).toContain(`tenant_isolation_${policyName}`);
    });

    it(`${table} uses scalar client_id RLS`, () => {
      const policyName = `tenant_isolation_${table.replace(/"/g, '').replace(/\s+/g, '_').toLowerCase()}`;
      const parts = combinedMigrations.split(`CREATE POLICY ${policyName}`);
      const section = parts.length > 1 ? parts[1] : '';
      if (section) {
        expect(section).toContain('client_id = current_setting');
      }
    });
  }

  // Portal read-set policy checks
  for (const { table } of PORTAL_READ_SET_TABLES) {
    it(`${table} has RLS ENABLED (0018 portal read-set)`, () => {
      const pattern = new RegExp(
        `ALTER\\s+TABLE\\s+${table.replace(/"/g, '"?')}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      expect(migration0018).toMatch(pattern);
    });

    it(`${table} has a tenant isolation policy (0018 portal read-set)`, () => {
      const policyName = table.replace(/"/g, '').replace(/\s+/g, '_').toLowerCase();
      expect(migration0018).toContain(`tenant_isolation_${policyName}`);
    });
  }

  it('0018 GRANT exists for Clients', () => {
    expect(migration0018).toMatch(/GRANT\s+SELECT\s+ON\s+"Clients"\s+TO\s+app_tenant/i);
  });

  it('0018 GRANT exists for policy_rulesets', () => {
    expect(migration0018).toMatch(/GRANT\s+SELECT\s+ON\s+policy_rulesets\s+TO\s+app_tenant/i);
  });

  it('0018 GRANT exists for policy_scope_exclusions', () => {
    expect(migration0018).toMatch(/GRANT\s+SELECT\s+ON\s+policy_scope_exclusions\s+TO\s+app_tenant/i);
  });

  it('Clients uses own-row policy (id = current_tenant)', () => {
    expect(migration0018).toMatch(/id\s*=\s*current_setting\('app\.current_tenant'/);
  });

  it('all RLS comparisons use text, never ::uuid', () => {
    const usingClauses = combinedMigrations.match(/USING\s*\([^)]+\)/g) ?? [];
    for (const clause of usingClauses) {
      expect(clause).not.toMatch(/::uuid/);
    }
  });

  it('app_tenant role is created', () => {
    expect(migration0006).toMatch(/CREATE\s+ROLE\s+app_tenant/i);
  });

  it('GRANTs exist for all Phase-1 tables', () => {
    for (const { table } of PHASE_1_TABLES) {
      expect(migration0006).toMatch(new RegExp(`GRANT\\s+.*\\s+ON\\s+${table.replace(/"/g, '"?')}\\s+TO\\s+app_tenant`, 'i'));
    }
  });
});

// ── CHECK constraint tests ──────────────────────────────────────────

describe('CHECK constraints (cardinality = 1)', () => {
  it('Invoices has single-client CHECK constraint', () => {
    expect(migration0006).toMatch(/chk_invoices_single_client/);
    expect(migration0006).toMatch(/cardinality\("Clients"\)\s*=\s*1/);
  });

  it('Audit Results has single-client CHECK constraint', () => {
    expect(migration0006).toMatch(/chk_audit_results_single_client/);
    expect(migration0006).toMatch(/cardinality\("Client"\)\s*=\s*1/);
  });

  it('Disputes has single-client CHECK constraint', () => {
    expect(migration0006).toMatch(/chk_disputes_single_client/);
    expect(migration0006).toMatch(/cardinality\("Client"\)\s*=\s*1/);
  });
});

// ── Behavioral integration test (gated on TEST_DATABASE_URL) ────────
// Requires a Neon branch with migrations 0006 + 0018 applied.
// Connects as app_tenant and verifies RLS enforcement at runtime.

const TEST_DB_URL = process.env.TEST_DATABASE_URL;

const BEHAVIORAL_TEST = TEST_DB_URL ? describe : describe.skip;

BEHAVIORAL_TEST('RLS Behavioral Isolation (live DB)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: TEST_DB_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  // Helper: get a tenant client and set the current tenant
  async function tenantClient(clientId?: string) {
    const client = await pool.connect();
    if (clientId) {
      await client.query('SET app.current_tenant = $1', [clientId]);
    }
    // If no clientId, leave app.current_tenant unset
    return client;
  }

  // Tables that should have RLS enforced (Phase-1 + portal read-set)
  const PROTECTED_TABLES = [
    '"Invoices"',
    '"Audit Results"',
    '"Disputes"',
    '"Clients"',
    'client_insurance_policies',
    'policy_rules',
    'policy_rulesets',
    'policy_scope_exclusions',
    'gateway_decisions',
  ];

  it('no tenant context → 0 rows on every protected table', async () => {
    const client = await tenantClient(); // no tenant set
    try {
      for (const table of PROTECTED_TABLES) {
        const result = await client.query(`SELECT count(*)::int AS cnt FROM ${table}`);
        const cnt = result.rows[0]?.cnt ?? -1;
        expect(cnt).toBe(0);
      }
    } finally {
      client.release();
    }
  });

  it('tenant A cannot see tenant B rows on scalar tables', async () => {
    const TABLE = 'gateway_decisions';

    // Seed: client-a row
    const seedA = await pool.query(
      `INSERT INTO ${TABLE} (id, client_id, correlation_id, decision)
       VALUES ('test-rls-a-0018', 'client-a', 'corr-a', 'block')
       ON CONFLICT (id) DO NOTHING
       RETURNING id`
    );

    // Seed: client-b row
    const seedB = await pool.query(
      `INSERT INTO ${TABLE} (id, client_id, correlation_id, decision)
       VALUES ('test-rls-b-0018', 'client-b', 'corr-b', 'allow')
       ON CONFLICT (id) DO NOTHING
       RETURNING id`
    );

    // Assert: client-a sees only its own row
    const clientA = await tenantClient('client-a');
    try {
      const r = await clientA.query(
        `SELECT id, client_id FROM ${TABLE} WHERE id LIKE 'test-rls-%' ORDER BY id`
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].client_id).toBe('client-a');
    } finally {
      clientA.release();
    }

    // Assert: client-b sees only its own row
    const clientB = await tenantClient('client-b');
    try {
      const r = await clientB.query(
        `SELECT id, client_id FROM ${TABLE} WHERE id LIKE 'test-rls-%' ORDER BY id`
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].client_id).toBe('client-b');
    } finally {
      clientB.release();
    }

    // Cleanup
    await pool.query(`DELETE FROM ${TABLE} WHERE id LIKE 'test-rls-%'`);
  });

  it('cross-tenant write (client-a writing client-b id) is rejected via RLS', async () => {
    const TABLE = 'gateway_decisions';

    // Seed a client-b row
    await pool.query(
      `INSERT INTO ${TABLE} (id, client_id, correlation_id, decision)
       VALUES ('test-rls-write-0018', 'client-b', 'corr-write', 'allow')
       ON CONFLICT (id) DO UPDATE SET decision = 'allow'`
    );

    // As client-a, try to UPDATE client-b's row
    const clientA = await tenantClient('client-a');
    try {
      const r = await clientA.query(
        `UPDATE ${TABLE} SET decision = 'block' WHERE id = 'test-rls-write-0018' RETURNING id`
      );
      // RLS should prevent the UPDATE — zero rows affected
      expect(r.rows).toHaveLength(0);
    } finally {
      clientA.release();
    }

    // Verify the client-b row is unchanged
    const r = await pool.query(
      `SELECT decision FROM ${TABLE} WHERE id = 'test-rls-write-0018'`
    );
    expect(r.rows[0]?.decision).toBe('allow');

    // Cleanup
    await pool.query(`DELETE FROM ${TABLE} WHERE id = 'test-rls-write-0018'`);
  });
});
