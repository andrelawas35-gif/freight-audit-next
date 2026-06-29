/*
  db/migrate.ts — Raw-SQL migration runner.

  IDEMPOTENT: running twice applies nothing on the second run.
  Reads db/migrations/*.sql in sort order, applies unapplied files
  via the Neon Pool (wire-protocol) driver, and records each
  completed migration in the _migrations tracking table.

  USAGE:
    DATABASE_URL=... npx tsx db/migrate.ts           # production / dev
    TEST_DATABASE_URL=... npx tsx db/migrate.ts       # CI (Neon branch)
    MIGRATION_RESET=true ... npx tsx db/migrate.ts    # force re-apply all

  OWNER: E1 (Platform / Migration Toolchain)
  WAVE:  0 (blocking)
*/

import { Pool } from '@neondatabase/serverless';
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

// ── Configuration ──────────────────────────────────────────────────

const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');
const FORCE_RESET = process.env.MIGRATION_RESET === 'true';

// ── Helpers ─────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(`${msg}\n`);
}

function err(msg: string) {
  process.stderr.write(`${msg}\n`);
}

// ── Key tables that MUST exist if migrations 0004-0014 were truly applied.
//    Used to detect "lying _migrations" (inherited from a parent provisioned
//    via drizzle-kit push, which skips raw SQL).
const POLICY_CANARY_TABLES = [
  'policy_rules',
  'policy_documents',
  'client_policies',
  'gateway_decisions',
  'shipment_insurance_audit_results',
];

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  if (!DATABASE_URL) {
    err('FATAL: DATABASE_URL or TEST_DATABASE_URL must be set in environment.');
    process.exit(1);
  }

  log('E1 · Migration Runner');
  log('────────────────────');

  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();

  try {
    // ── 1. RESET path: drop all objects in public schema, then proceed to apply all ──
    if (FORCE_RESET) {
      log('MIGRATION_RESET=true — dropping all objects in public schema, re-applying all files.');
      // Drop all tables, views, functions, etc. in public schema. Each DROP is
      // wrapped in an exception handler because some objects may be owned by
      // cloud_admin (Neon system role), not neondb_owner.
      await client.query(`
        DO $$ DECLARE
          r RECORD;
        BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename) LOOP
            BEGIN
              EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
            EXCEPTION WHEN OTHERS THEN
              RAISE WARNING 'Could not drop table %: %', r.tablename, SQLERRM;
            END;
          END LOOP;
          FOR r IN (SELECT viewname FROM pg_views WHERE schemaname = 'public') LOOP
            BEGIN
              EXECUTE 'DROP VIEW IF EXISTS public.' || quote_ident(r.viewname) || ' CASCADE';
            EXCEPTION WHEN OTHERS THEN
              RAISE WARNING 'Could not drop view %: %', r.viewname, SQLERRM;
            END;
          END LOOP;
          FOR r IN (SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
                    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE n.nspname = 'public' AND p.prokind = 'f') LOOP
            BEGIN
              EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.args || ') CASCADE';
            EXCEPTION WHEN OTHERS THEN
              RAISE WARNING 'Could not drop function %: %', r.proname, SQLERRM;
            END;
          END LOOP;
        END $$;
      `);
      // Enable required extensions (must be done before migrations that use them)
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      // Re-create _migrations in the fresh public schema
      await client.query(`
        CREATE TABLE _migrations (
          name        text PRIMARY KEY,
          applied_at  timestamptz NOT NULL DEFAULT now()
        )
      `);
    }

    // ── 2. Ensure tracking table exists (non-RESET path) ────────────
    if (!FORCE_RESET) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          name        text PRIMARY KEY,
          applied_at  timestamptz NOT NULL DEFAULT now()
        )
      `);
    }

    // ── 3. Query already-applied migrations ────────────────────────
    const { rows: appliedRows } = await client.query(
      'SELECT name FROM _migrations ORDER BY name'
    );
    const appliedSet = new Set(appliedRows.map((r: { name: string }) => r.name));

    // ── 4. Discover migration files (sorted) ───────────────────────
    const allFiles = readdirSync(MIGRATIONS_DIR)
      .filter((f) => extname(f) === '.sql')
      .sort();

    if (allFiles.length === 0) {
      log('No migration files found.');
      return;
    }

    // ── 4a. Auto-baseline (non-RESET only — RESET always starts empty) ──
    if (appliedSet.size === 0 && !FORCE_RESET) {
      const { rows: check } = await client.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'app_users'
        ) AS "exists"`
      );
      if (check[0]?.exists === true) {
        // Check if policy canary tables exist — if not, the parent was
        // provisioned via drizzle-kit push and auto-baseline would lie.
        const missing: string[] = [];
        for (const tbl of POLICY_CANARY_TABLES) {
          const { rows: r } = await client.query(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = $1
            ) AS "exists"`,
            [tbl]
          );
          if (!r[0]?.exists) missing.push(tbl);
        }

        if (missing.length > 0) {
          err('');
          err('⚠️  Auto-baseline BLOCKED: app_users exists but policy tables are missing.');
          err(`   Missing canary tables: ${missing.join(', ')}`);
          err('   This branch was likely provisioned via drizzle-kit push,');
          err('   which skips raw-SQL migrations (RLS, grants, policy tables).');
          err('   Re-run with MIGRATION_RESET=true to force-apply all migrations.');
          err('');
          process.exit(1);
        }

        log('Auto-baseline: app_users + policy canaries exist, recording all migrations as applied.');
        for (const file of allFiles) {
          await client.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        }
        // Refresh appliedSet
        const { rows: refreshed } = await client.query('SELECT name FROM _migrations ORDER BY name');
        for (const r of refreshed) appliedSet.add(r.name);
      }
    }

    // ── 4. Apply unapplied migrations ──────────────────────────────
    let applied = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const file of allFiles) {
      if (appliedSet.has(file)) {
        skipped++;
        continue;
      }

      const filePath = join(MIGRATIONS_DIR, file);
      let sql = readFileSync(filePath, 'utf-8');

      // Strip the statement-breakpoint comments left by early Drizzle
      // generations (migrations 0000, 0001). These are just comments
      // but removing them keeps the query log cleaner.
      sql = sql.replace(/-->\s*statement-breakpoint\s*/gi, '');

      // In RESET mode, strip CONCURRENTLY from index creation — there is
      // no live traffic and Pool connections wrap queries in transactions.
      if (FORCE_RESET) {
        sql = sql.replace(/CREATE\s+INDEX\s+CONCURRENTLY/gi, 'CREATE INDEX');
      }

      // Skip empty files
      if (!sql.trim()) {
        log(`  ⊘ ${file}  (empty, recording as applied)`);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        applied++;
        continue;
      }

      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        log(`  ✓ ${file}`);
        applied++;
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        err(`  ✗ ${file}  FAILED: ${msg}`);
        errors.push(`${file}: ${msg}`);
        // Stop on first error — do not continue with dependent migrations
        break;
      }
    }

    // ── 5. Report ──────────────────────────────────────────────────
    log('────────────────────');
    if (errors.length > 0) {
      err(`FAILED after applying ${applied}, skipping ${skipped}. Errors:`);
      for (const e of errors) err(`  - ${e}`);
      process.exit(1);
    }

    if (applied === 0) {
      log(`All ${skipped} migration(s) already applied. (idempotent ✓)`);
    } else {
      log(
        `Applied ${applied}, skipped ${skipped} already-applied. ` +
          `Total: ${applied + skipped} migration(s).`
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  err(`Unhandled error: ${e?.message ?? String(e)}`);
  process.exit(1);
});
