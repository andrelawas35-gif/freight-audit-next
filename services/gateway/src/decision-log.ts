/**
 * decision-log.ts — At-least-once durable buffer → gateway_decisions (08-gateway.md D6).
 *
 * The decision log IS the insurance product — evidence the Gateway warned/blocked.
 * "Respond first, persist second — but guarantee the persist."
 *
 * Buffer: append-only JSON-lines file. On crash and restart, drain unplayed entries.
 * Drain: periodic (config.bufferDrainIntervalMs) flush to gateway_decisions table
 * via getSql() using a transaction that SETs app.current_tenant for RLS.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getSql } from '../../../lib/db';
import { getConfig } from './config';

interface DecisionLogEntry {
  id: string;
  client_id: string;
  correlation_id: string;
  request_json: unknown;
  decision: string;
  enforced: boolean;
  violations: unknown;
  ruleset_version: string | null;
  degraded: boolean;
  ruleset_snapshot_id: string | null;
  created_at: string;
}

let bufferPath: string;
let drainTimer: ReturnType<typeof setInterval> | null = null;

/** Append an entry to the durable buffer file (append-only JSONL). */
export function bufferDecision(entry: DecisionLogEntry): void {
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(bufferPath, line, 'utf-8');
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'gateway buffer append failed',
        ts: new Date().toISOString(),
        correlationId: entry.correlation_id,
        err: String(err),
      }),
    );
  }
}

/** Drain all buffered entries to the gateway_decisions table. */
export async function drainBuffer(): Promise<number> {
  const lines = readBufferLines();
  if (lines.length === 0) return 0;

  const sql = getSql();
  let drained = 0;

  for (const line of lines) {
    try {
      const entry: DecisionLogEntry = JSON.parse(line);
      // Use a transaction that SETs app.current_tenant so RLS allows the INSERT.
      // On the Neon HTTP driver, transaction([...]) runs on the same backend.
      await sql`BEGIN`;
      try {
        await sql`SELECT set_config('app.current_tenant', ${entry.client_id}, true)`;
        await sql`
          INSERT INTO gateway_decisions
            (id, client_id, correlation_id, request_json, decision,
             enforced, violations, ruleset_version, degraded,
             ruleset_snapshot_id, created_at)
          VALUES
            (${entry.id}, ${entry.client_id}, ${entry.correlation_id},
             ${JSON.stringify(entry.request_json)}::jsonb,
             ${entry.decision}, ${entry.enforced},
             ${JSON.stringify(entry.violations)}::jsonb,
             ${entry.ruleset_version}, ${entry.degraded},
             ${entry.ruleset_snapshot_id}, ${entry.created_at}::timestamptz)
        `;
        await sql`COMMIT`;
        drained++;
      } catch (txErr) {
        await sql`ROLLBACK`;
        throw txErr;
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'gateway buffer drain failed for entry',
          ts: new Date().toISOString(),
          err: String(err),
        }),
      );
      // Don't truncate — retain failed entries for retry
      return drained;
    }
  }

  // On full success, truncate the buffer file
  try {
    fs.writeFileSync(bufferPath, '', 'utf-8');
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'gateway buffer truncate failed',
        ts: new Date().toISOString(),
        err: String(err),
      }),
    );
  }

  return drained;
}

function readBufferLines(): string[] {
  try {
    if (!fs.existsSync(bufferPath)) return [];
    const content = fs.readFileSync(bufferPath, 'utf-8');
    return content.split('\n').filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}

/** Replay undrained entries from a previous crash. */
export async function replayBuffer(): Promise<number> {
  const lines = readBufferLines();
  if (lines.length === 0) return 0;

  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'gateway replaying buffer',
      ts: new Date().toISOString(),
      pendingCount: lines.length,
    }),
  );

  return drainBuffer();
}

/** Start periodic buffer drain. */
export function startBufferDrain(): void {
  const { bufferDrainIntervalMs, bufferPath: bp } = getConfig();
  bufferPath = path.resolve(bp);

  // Replay first (crash recovery)
  replayBuffer().then((count) => {
    if (count > 0) {
      console.log(
        JSON.stringify({
          level: 'info',
          msg: 'gateway buffer replay complete',
          ts: new Date().toISOString(),
          drained: count,
        }),
      );
    }
  });

  // Periodic drain
  drainTimer = setInterval(() => {
    drainBuffer().then((count) => {
      if (count > 0) {
        console.log(
          JSON.stringify({
            level: 'info',
            msg: 'gateway buffer drained',
            ts: new Date().toISOString(),
            count,
          }),
        );
      }
    });
  }, bufferDrainIntervalMs);

  if (drainTimer.unref) drainTimer.unref();
}

/** Stop buffer drain and flush remaining entries. */
export async function stopBufferDrain(): Promise<void> {
  if (drainTimer) {
    clearInterval(drainTimer);
    drainTimer = null;
  }
  // Final drain
  const remaining = readBufferLines().length;
  if (remaining > 0) {
    await drainBuffer();
  }
}
