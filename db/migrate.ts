/*
  db/migrate.ts — Raw-SQL migration runner.

  IDEMPOTENT: running twice applies nothing on the second run.
  Reads db/migrations/*.sql in sort order, applies unapplied files
  via the Neon Pool (wire-protocol) driver, and records each
  completed migration in the _migrations tracking table.

  USAGE:
    DATABASE_URL=... npx tsx db/migrate.ts       # production / dev
    TEST_DATABASE_URL=... npx tsx db/migrate.ts   # CI (Neon branch)

  OWNER: E1 (Platform / Migration Toolchain)
  WAVE:  0 (blocking)
*/

import { Pool } from '@neondatabase/serverless';
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

// ── Configuration ──────────────────────────────────────────────────

const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

// ── Helpers ─────────────────────────────────────────────────────────

function log(msg: string) {
  process.stdout.write(`${msg}\n`);
}

function err(msg: string) {
  process.stderr.write(`${msg}\n`);
}

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
    // ── 1. Ensure tracking table exists ────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name        text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    // ── 2. Query already-applied migrations ────────────────────────
    const { rows: appliedRows } = await client.query(
      'SELECT name FROM _migrations ORDER BY name'
    );
    const appliedSet = new Set(appliedRows.map((r: { name: string }) => r.name));

    // ── 3. Discover migration files (sorted) ───────────────────────
    const allFiles = readdirSync(MIGRATIONS_DIR)
      .filter((f) => extname(f) === '.sql')
      .sort();

    if (allFiles.length === 0) {
      log('No migration files found.');
      return;
    }

    // ── 3a. Auto-baseline: if _migrations is empty but app_users
    //     already exists, the DB was provisioned before this runner.
    //     Record all migration files as already-applied. ────────────
    if (appliedSet.size === 0) {
      const { rows: check } = await client.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'app_users'
        ) AS "exists"`
      );
      if (check[0]?.exists === true) {
        log('Auto-baseline: app_users exists, recording all migrations as applied.');
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
