/*
  lib/ingestion/code-mapping.ts — 4-stage code mapping lifecycle helpers.

  Lifecycle: open → ai_proposed → human_confirmed → learned

  Mirrors the resolveException() flow but splits the stages so the analyst
  can confirm AI proposals before the mapping is committed.
*/

import { getSql } from '@/lib/db';
import { updateRecord } from '@/lib/db/records';
import type { CodeMappingStatus } from '@/lib/intelligence/taxonomy';
import type { ExceptionRow } from './mappings';

/**
 * Propose an AI mapping for an open exception.
 * Transitions status from 'open' to 'ai_proposed'.
 */
export async function proposeMapping(
  exceptionId: string,
  suggestedCode: string,
  reasoning: string,
  confidence: number,
): Promise<void> {
  const sql = getSql();
  await sql.query(
    `UPDATE ingestion_exceptions
       SET status = 'ai_proposed',
           suggested_code = $2,
           reasoning = $3,
           suggested_confidence = $4
     WHERE id = $1`,
    [exceptionId, suggestedCode, reasoning, Math.round(confidence)],
  );
}

/**
 * Analyst confirms an AI-proposed mapping.
 * Transitions status from 'ai_proposed' to 'human_confirmed'.
 */
export async function confirmMapping(exceptionId: string, actor: string): Promise<void> {
  await updateRecord('ingestion_exceptions', exceptionId, {
    status: 'human_confirmed' satisfies CodeMappingStatus,
    resolved_by: actor,
  }, actor);
}

/**
 * Advance an ingestion_exception to learned status.
 *
 * Precondition: the exception must be in 'human_confirmed' status.
 * Auto-upserts into learned_mappings (idempotent — safe to call multiple times).
 * Transitions status from 'human_confirmed' to 'learned'.
 */
export async function learnMapping(exceptionId: string, actor: string): Promise<void> {
  const sql = getSql();

  // 1. Fetch the exception
  const rows = (await sql.query(
    'SELECT * FROM ingestion_exceptions WHERE id = $1',
    [exceptionId],
  )) as ExceptionRow[];
  const exc = rows[0];
  if (!exc) throw new Error(`Exception ${exceptionId} not found`);

  // 2. Verify it's in human_confirmed status
  if (exc.status !== 'human_confirmed') {
    throw new Error(
      `Exception ${exceptionId} is in status '${exc.status}', expected 'human_confirmed'`,
    );
  }

  if (!exc.suggested_code) {
    throw new Error(
      `Exception ${exceptionId} has no suggested_code — cannot learn without a confirmed mapping`,
    );
  }

  // 3. Upsert into learned_mappings (ON CONFLICT idempotent)
  const existing = (await sql.query(
    `SELECT id FROM learned_mappings
      WHERE mapping_type = $1
        AND coalesce(carrier_scac, '') = coalesce($2, '')
        AND upper(raw_code) = upper($3)
      LIMIT 1`,
    [exc.mapping_type, exc.carrier_scac, exc.raw_code],
  )) as { id: string }[];

  let mappingId: string;
  if (existing.length) {
    await sql.query(
      `UPDATE learned_mappings
         SET standard_code = $2, author = $3, updated_at = now()
       WHERE id = $1`,
      [existing[0].id, exc.suggested_code, actor],
    );
    mappingId = existing[0].id;
  } else {
    const ins = (await sql.query(
      `INSERT INTO learned_mappings (mapping_type, carrier_scac, raw_code, standard_code, author)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [exc.mapping_type, exc.carrier_scac, exc.raw_code, exc.suggested_code, actor],
    )) as { id: string }[];
    mappingId = ins[0].id;
  }

  // 4. Update exception status to 'learned'
  await updateRecord('ingestion_exceptions', exceptionId, {
    status: 'learned' satisfies CodeMappingStatus,
    resolved_by: actor,
    resolved_at: new Date().toISOString(),
    learned_mapping_id: mappingId,
  }, actor);
}
