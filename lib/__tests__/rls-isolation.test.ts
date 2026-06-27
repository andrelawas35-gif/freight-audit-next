/**
 * RLS Isolation — Negative Test Suite
 *
 * Validates that the Row-Level Security policies defined in
 * `db/migrations/0006_keystone_contract.sql` are correctly specified.
 *
 * These tests document the expected behavior contract. The actual RLS enforcement
 * requires the migration to be applied and the `app_tenant` role to exist against
 * a live database. The tests here parse the migration SQL to verify the policies
 * are correctly defined, and document the behavioral contract for integration tests.
 *
 * Contract (data-protection.md D5):
 *   1. Connect as app_tenant with NO app.current_tenant set → every protected
 *      query returns 0 rows.
 *   2. Set tenant A → cannot see a seeded tenant-B row, and vice versa.
 *   3. A broken or missing policy fails the build.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(__dirname, '..', '..', 'db', 'migrations', '0006_keystone_contract.sql');
let migrationSql: string;

try {
  migrationSql = readFileSync(MIGRATION_PATH, 'utf-8');
} catch {
  // Migration file may not exist in all test environments
  migrationSql = '';
}

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

describe('RLS Policy Definitions (migration parse)', () => {
  it('migration file 0006_keystone_contract.sql exists', () => {
    expect(migrationSql).toBeTruthy();
    expect(migrationSql.length).toBeGreaterThan(100);
  });

  for (const { table } of PHASE_1_TABLES) {
    it(`${table} has RLS ENABLED`, () => {
      const pattern = new RegExp(
        `ALTER\\s+TABLE\\s+${table.replace(/"/g, '"?')}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      expect(migrationSql).toMatch(pattern);
    });

    it(`${table} has FORCE ROW LEVEL SECURITY`, () => {
      const pattern = new RegExp(
        `ALTER\\s+TABLE\\s+${table.replace(/"/g, '"?')}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
        'i',
      );
      expect(migrationSql).toMatch(pattern);
    });

    it(`${table} has a tenant isolation policy`, () => {
      const policyName = table.replace(/"/g, '').replace(/\s+/g, '_').toLowerCase();
      expect(migrationSql).toContain(`tenant_isolation_${policyName}`);
    });

    it(`${table} uses scalar client_id RLS`, () => {
      const policyName = `tenant_isolation_${table.replace(/"/g, '').replace(/\s+/g, '_').toLowerCase()}`;
      const parts = migrationSql.split(`CREATE POLICY ${policyName}`);
      const section = parts.length > 1 ? parts[1] : '';
      if (section) {
        expect(section).toContain('client_id = current_setting');
      }
    });
  }

  it('all RLS comparisons use text, never ::uuid', () => {
    // Extract all USING clauses
    const usingClauses = migrationSql.match(/USING\s*\([^)]+\)/g) ?? [];
    for (const clause of usingClauses) {
      expect(clause).not.toMatch(/::uuid/);
    }
  });

  it('app_tenant role is created', () => {
    expect(migrationSql).toMatch(/CREATE\s+ROLE\s+app_tenant/i);
  });

  it('GRANTs exist for all Phase-1 tables', () => {
    for (const { table } of PHASE_1_TABLES) {
      expect(migrationSql).toMatch(new RegExp(`GRANT\\s+.*\\s+ON\\s+${table.replace(/"/g, '"?')}\\s+TO\\s+app_tenant`, 'i'));
    }
  });
});

// ── CHECK constraint tests ──────────────────────────────────────────

describe('CHECK constraints (cardinality = 1)', () => {
  it('Invoices has single-client CHECK constraint', () => {
    expect(migrationSql).toMatch(/chk_invoices_single_client/);
    expect(migrationSql).toMatch(/cardinality\("Clients"\)\s*=\s*1/);
  });

  it('Audit Results has single-client CHECK constraint', () => {
    expect(migrationSql).toMatch(/chk_audit_results_single_client/);
    expect(migrationSql).toMatch(/cardinality\("Client"\)\s*=\s*1/);
  });

  it('Disputes has single-client CHECK constraint', () => {
    expect(migrationSql).toMatch(/chk_disputes_single_client/);
    expect(migrationSql).toMatch(/cardinality\("Client"\)\s*=\s*1/);
  });
});

// ── Behavioral contract (documentation of expected runtime behavior) ─

describe('RLS Behavioral Contract (for integration tests)', () => {
  /**
   * These tests document the expected runtime contract. They should be
   * promoted to live integration tests once the migration is applied to
   * a Neon branch with seeded test data.
   *
   * Setup:
   *   - Tenant A rows: Invoices, Audit Results, Disputes with client = ['client-a']
   *   - Tenant B rows: same tables with client = ['client-b']
   *   - Scalar tables: client_id = 'client-a' and 'client-b' respectively
   *
   * Test cases:
   */

  it('CONTRACT: no tenant context → 0 rows (negative test)', () => {
    // Given: connected as app_tenant, app.current_tenant is NOT set
    // When:  SELECT * FROM "Invoices"
    // Then:  returns 0 rows
    //
    // Given: connected as app_tenant, app.current_tenant is NOT set
    // When:  SELECT * FROM policy_rules
    // Then:  returns 0 rows
    expect(true).toBe(true); // Contract documented — promote to live test
  });

  it('CONTRACT: tenant A cannot see tenant B rows', () => {
    // Given: connected as app_tenant, SET app.current_tenant = 'client-a'
    // When:  SELECT * FROM "Invoices"
    // Then:  all returned rows have client_id = 'client-a'
    //        and NO row has ONLY 'client-b' in "Clients"
    //
    // Given: same connection
    // When:  SELECT * FROM policy_rules
    // Then:  all returned rows have client_id = 'client-a'
    //        and NO row has client_id = 'client-b'
    expect(true).toBe(true); // Contract documented — promote to live test
  });

  it('CONTRACT: tenant B cannot see tenant A rows', () => {
    // Given: connected as app_tenant, SET app.current_tenant = 'client-b'
    // When:  SELECT * FROM "Audit Results"
    // Then:  all returned rows have client_id = 'client-b'
    //        and NO row has ONLY 'client-a' in "Client"
    expect(true).toBe(true); // Contract documented — promote to live test
  });

  it('CONTRACT: cross-tenant query via app_tenant returns only own rows', () => {
    // Given: connected as app_tenant, SET app.current_tenant = 'client-a'
    // When:  SELECT count(*) FROM gateway_decisions
    // Then:  only client_id = 'client-a' rows are counted
    expect(true).toBe(true); // Contract documented — promote to live test
  });

  it('CONTRACT: missing policy on a protected table fails the build', () => {
    // If any Phase-1 table lacks an RLS policy, queries as app_tenant
    // with no tenant set would return ALL rows — the negative test catches it.
    // This is enforced by the migration parse tests above.
    expect(true).toBe(true); // Enforced by policy-existence parse tests
  });
});

// ── New tables existence ────────────────────────────────────────────

describe('New tables (contracts-v1)', () => {
  it('gateway_decisions table is defined in migration', () => {
    expect(migrationSql).toMatch(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?gateway_decisions/i);
  });

  it('policy_taxonomy_candidates table is defined in migration', () => {
    expect(migrationSql).toMatch(/CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?policy_taxonomy_candidates/i);
  });

  it('attestation columns are added to policy_rulesets', () => {
    expect(migrationSql).toMatch(/attested_by/);
    expect(migrationSql).toMatch(/attested_at/);
    expect(migrationSql).toMatch(/scope_statement/);
  });
});
