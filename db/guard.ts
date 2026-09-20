/*
  db/guard.ts — refuse destructive database commands aimed at production.

  WHY: .env.local once pointed at the production Neon endpoint, so an exported
  DATABASE_URL was enough to send `db:push` (drizzle-kit push) or `db:migrate`
  at real data. This check runs BEFORE any connection is opened.

  It applies only to command-line tooling (db/migrate.ts, drizzle.config.ts).
  It must NOT be imported by lib/db.ts: the deployed app legitimately uses
  production.

  Protected endpoints are listed by name in db/protected-endpoints.json (a
  Neon endpoint name is not a credential). The pooled and per-compute hosts of
  an endpoint ("ep-x-pooler", "ep-x-abc-pooler") count as the same endpoint.

  Deliberate override for a real production run:
    ALLOW_PRODUCTION_DB=yes-this-is-production

  WO 2026-09-20-001.
*/

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const OVERRIDE_ENV = 'ALLOW_PRODUCTION_DB';
export const OVERRIDE_VALUE = 'yes-this-is-production';

/** Neon endpoint name from a connection string, or null if it has none. */
export function endpointOf(connectionString: string): string | null {
  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return null;
  }
  const label = host.split('.')[0];
  return label.startsWith('ep-') ? label : null;
}

/** True when `endpoint` is (a pooled/compute variant of) a protected one. */
export function isProtected(endpoint: string, protectedEndpoints: string[]): boolean {
  return protectedEndpoints.some((p) => endpoint === p || endpoint.startsWith(`${p}-`));
}

export function loadProtectedEndpoints(): string[] {
  const file = join(process.cwd(), 'db', 'protected-endpoints.json');
  const parsed = JSON.parse(readFileSync(file, 'utf-8')) as { protectedEndpoints?: unknown };
  if (!Array.isArray(parsed.protectedEndpoints)) {
    throw new Error(`${file}: "protectedEndpoints" must be an array`);
  }
  return parsed.protectedEndpoints.filter((e): e is string => typeof e === 'string');
}

/**
 * Throws if `connectionString` targets a protected (production) endpoint and
 * the deliberate override is not set. Does nothing for an undefined URL:
 * callers report a missing URL themselves.
 */
export function assertNotProduction(
  connectionString: string | undefined,
  options: {
    protectedEndpoints?: string[];
    env?: Record<string, string | undefined>;
    command?: string;
  } = {},
): void {
  if (!connectionString) return;
  const endpoint = endpointOf(connectionString);
  if (!endpoint) return;
  const protectedEndpoints = options.protectedEndpoints ?? loadProtectedEndpoints();
  if (!isProtected(endpoint, protectedEndpoints)) return;

  const env = options.env ?? process.env;
  if (env[OVERRIDE_ENV] === OVERRIDE_VALUE) return;

  throw new Error(
    `REFUSING to run${options.command ? ` ${options.command}` : ''}: the database URL targets the ` +
      `PRODUCTION endpoint "${endpoint}". Use a development or test branch ` +
      `(set TEST_DATABASE_URL / DATABASE_URL to it). If you really mean production, set ` +
      `${OVERRIDE_ENV}=${OVERRIDE_VALUE} for this one command.`,
  );
}
