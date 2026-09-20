/*
  lib/audit/jobs.ts — audit job queue with concurrency protection.

  Prevents overlapping audit runs for the same client scope. Jobs are
  queued, then claimed and executed by the /api/run-audit/process route.
  Vercel Cron or an external scheduler polls that endpoint periodically.

  Concurrency guarantee: only one 'running' job per (job_type, client_id)
  combination is allowed. The claim uses SELECT ... FOR UPDATE SKIP LOCKED
  so multiple pollers don't race.
*/

import { getSql } from '@/lib/db';

export type AuditJob = {
  id: string;
  job_type: string;
  client_id: string | null;
  dry_run: boolean;
  status: string;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  run_id: string | null;
  result: unknown;
  error: string | null;
  triggered_by: string | null;
  cycle: string | null;
};

export async function enqueueAudit(input: {
  jobType?: 'parcel' | '3pl' | 'data_clerk' | 'sftp_fetch';
  clientId?: string;
  dryRun?: boolean;
  triggeredBy?: string;
  cycle?: string;
}): Promise<AuditJob> {
  const sql = getSql();
  const jobType = input.jobType ?? 'parcel';
  const clientId = input.clientId ?? null;

  // Reject if there's already a queued or running job for this scope
  const existing = (await sql.query(
    `SELECT id, status FROM audit_jobs
     WHERE job_type = $1
       AND (client_id = $2 OR ($2 IS NULL AND client_id IS NULL))
       AND status IN ('queued', 'running')
     LIMIT 1`,
    [jobType, clientId]
  )) as { id: string; status: string }[];

  if (existing.length > 0) {
    throw new Error(
      `Audit already ${existing[0].status} for ${jobType}` +
      (clientId ? ` client ${clientId}` : ' (all clients)') +
      ` — job ${existing[0].id}`
    );
  }

  const rows = (await sql.query(
    `INSERT INTO audit_jobs (job_type, client_id, dry_run, triggered_by, cycle)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [jobType, clientId, input.dryRun ?? false, input.triggeredBy ?? null, input.cycle ?? null]
  )) as AuditJob[];

  return rows[0];
}

export async function claimNextJob(): Promise<AuditJob | null> {
  const sql = getSql();

  // Atomic claim: pick the oldest queued job that has no running sibling
  // for the same (job_type, client_id) scope.
  const rows = (await sql.query(
    `UPDATE audit_jobs SET status = 'running', started_at = now()
     WHERE id = (
       SELECT j.id FROM audit_jobs j
       WHERE j.status = 'queued'
         AND NOT EXISTS (
           SELECT 1 FROM audit_jobs r
           WHERE r.job_type = j.job_type
             AND (r.client_id = j.client_id OR (r.client_id IS NULL AND j.client_id IS NULL))
             AND r.status = 'running'
         )
       ORDER BY j.queued_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  )) as AuditJob[];

  return rows[0] ?? null;
}

export async function completeJob(
  jobId: string,
  result: { runId?: string; summary: unknown }
): Promise<void> {
  const sql = getSql();
  await sql.query(
    `UPDATE audit_jobs
     SET status = 'completed', finished_at = now(), run_id = $2, result = $3
     WHERE id = $1`,
    [jobId, result.runId ?? null, JSON.stringify(result.summary)]
  );
}

export async function failJob(jobId: string, error: string): Promise<void> {
  const sql = getSql();
  await sql.query(
    `UPDATE audit_jobs
     SET status = 'failed', finished_at = now(), error = $2
     WHERE id = $1`,
    [jobId, error]
  );
}

export async function getJob(jobId: string): Promise<AuditJob | null> {
  const sql = getSql();
  const rows = (await sql.query(
    'SELECT * FROM audit_jobs WHERE id = $1 LIMIT 1',
    [jobId]
  )) as AuditJob[];
  return rows[0] ?? null;
}

export async function listJobs(limit = 25): Promise<AuditJob[]> {
  const sql = getSql();
  return (await sql.query(
    'SELECT * FROM audit_jobs ORDER BY queued_at DESC LIMIT $1',
    [limit]
  )) as AuditJob[];
}

export async function expireStaleJobs(timeoutMinutes = 15): Promise<number> {
  const sql = getSql();
  const rows = (await sql.query(
    `UPDATE audit_jobs
     SET status = 'failed', finished_at = now(), error = 'Timed out after ' || $1 || ' minutes'
     WHERE status = 'running'
       AND started_at < now() - ($1 || ' minutes')::interval
     RETURNING id`,
    [timeoutMinutes]
  )) as { id: string }[];
  return rows.length;
}
