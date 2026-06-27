'use server';

import { auth } from '@/auth';
import { getSql } from '@/lib/db';

export type AttestationRecord = {
  id: string;
  client_id: string;
  policy_id: string | null;
  policy_name: string | null;
  attested_at: string;
  attested_by: string;
  ruleset_version: string | null;
};

export type AttestationData = {
  current: AttestationRecord[];
  pendingCount: number;
};

export async function getAttestationData(clientId: string): Promise<AttestationData> {
  const sql = getSql();
  try {
    const current = (await sql.query(
      `SELECT id, client_id, policy_id, policy_name, attested_at::text, attested_by, ruleset_version
       FROM policy_attestations
       WHERE client_id = $1
       ORDER BY attested_at DESC
       LIMIT 10`,
      [clientId]
    )) as AttestationRecord[];

    const pendingResult = (await sql.query(
      `SELECT count(*)::int AS count
       FROM policy_rulesets
       WHERE client_id = $1 AND status = 'client_attested'`,
      [clientId]
    )) as { count: number }[];
    const pendingCount = pendingResult?.[0]?.count ?? 0;

    return { current: current || [], pendingCount };
  } catch {
    // Table may not exist yet — graceful degradation
    return { current: [], pendingCount: 0 };
  }
}

export async function attestPolicy(
  policyId: string,
  rulesetVersion: string
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.clientId) return { success: false, error: 'Not authenticated' };

  const sql = getSql();
  try {
    await sql.query(
      `INSERT INTO policy_attestations (client_id, policy_id, attested_by, ruleset_version)
       VALUES ($1, $2, $3, $4)`,
      [session.user.clientId, policyId, session.user.email || 'unknown', rulesetVersion]
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
