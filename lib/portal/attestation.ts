'use server';

import { auth } from '@/auth';
import { getSql } from '@/lib/db';

export type AttestationRecord = {
  id: string;
  client_id: string;
  ruleset_id: string;
  attested_by: string;
  attested_at: string;
  scope_statement: string | null;
  valid_until: string | null;
  created_at: string;
};

export type AttestationData = {
  current: AttestationRecord[];
  pendingCount: number;
};

/**
 * Get attestation data for a client — current attestations + pending count.
 * Pending count = rulesets in 'client_attested' status that haven't been
 * formally recorded in policy_attestations (the canonical authority).
 */
export async function getAttestationData(clientId: string): Promise<AttestationData> {
  const sql = getSql();
  try {
    const current = (await sql.query(
      `SELECT id, client_id, ruleset_id, attested_by, attested_at::text,
              scope_statement, valid_until::text, created_at::text
       FROM policy_attestations
       WHERE client_id = $1
       ORDER BY attested_at DESC
       LIMIT 10`,
      [clientId]
    )) as AttestationRecord[];

    // Pending: rulesets the client should attest but hasn't yet
    const pendingResult = (await sql.query(
      `SELECT count(*)::int AS count
       FROM policy_rulesets prs
       WHERE prs.client_id = $1
         AND prs.status = 'client_attested'
         AND NOT EXISTS (
           SELECT 1 FROM policy_attestations pa
           WHERE pa.ruleset_id = prs.id AND pa.client_id = prs.client_id
         )`,
      [clientId]
    )) as { count: number }[];
    const pendingCount = pendingResult?.[0]?.count ?? 0;

    return { current: current || [], pendingCount };
  } catch {
    // Table may not exist yet — graceful degradation
    return { current: [], pendingCount: 0 };
  }
}

/**
 * Get the single most recent attestation for a client.
 * Returns null if no attestation exists.
 */
export async function getLatestAttestation(clientId: string): Promise<AttestationRecord | null> {
  const sql = getSql();
  try {
    const rows = (await sql.query(
      `SELECT id, client_id, ruleset_id, attested_by, attested_at::text,
              scope_statement, valid_until::text, created_at::text
       FROM policy_attestations
       WHERE client_id = $1
       ORDER BY attested_at DESC
       LIMIT 1`,
      [clientId]
    )) as AttestationRecord[];
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Record a client attestation for a ruleset.
 * Upserts on (client_id, ruleset_id) — re-attestation overwrites the previous record.
 * Requires authenticated session with matching clientId.
 */
export async function attestRuleset(
  clientId: string,
  rulesetId: string,
  scopeStatement?: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.clientId) return { success: false, error: 'Not authenticated' };
  if (session.user.clientId !== clientId) return { success: false, error: 'Client scope mismatch' };

  const sql = getSql();
  try {
    await sql.query(
      `INSERT INTO policy_attestations (client_id, ruleset_id, attested_by, scope_statement)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id, ruleset_id)
       DO UPDATE SET
         attested_by = EXCLUDED.attested_by,
         attested_at = NOW(),
         scope_statement = COALESCE(EXCLUDED.scope_statement, policy_attestations.scope_statement)`,
      [clientId, rulesetId, session.user.email || 'unknown', scopeStatement || null]
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * @deprecated Use attestRuleset(clientId, rulesetId, scopeStatement) instead.
 * Backward-compatible wrapper for components still using the old signature.
 */
export async function attestPolicy(
  rulesetId: string,
  _rulesetVersion: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.clientId) return { success: false, error: 'Not authenticated' };
  return attestRuleset(session.user.clientId, rulesetId);
}
