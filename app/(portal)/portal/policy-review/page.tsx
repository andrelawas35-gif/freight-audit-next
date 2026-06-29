/*
  app/(portal)/portal/policy-review/page.tsx — T4 Client Ambiguity Dashboard (ADR 0012 D5)

  Shows unmapped policy clauses that the extraction pipeline couldn't classify.
  Clients review each clause and choose:
    Define  — provide an operational definition → creates draft rule
    Exclude — client chooses not to enforce → binding governance record
    Flag    — route to staff for further review
*/

import { auth } from '@/auth';
import { getUnmappedClausesForClient, type UnmappedClauseRow } from '@/lib/intelligence/policy-service';
import { PolicyReviewClient } from './policy-review-client';

export const dynamic = 'force-dynamic';

export default async function PolicyReviewPage() {
  const session = await auth();
  const clientId = session?.user?.clientId;

  if (!clientId) {
    return (
      <div style={{ color: 'var(--ink-2)', fontSize: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Policy Review</h1>
        <p>
          Your account isn't linked to a client company yet. Please contact your Aurelian Collective
          account manager to finish setup.
        </p>
      </div>
    );
  }

  let clauses: UnmappedClauseRow[] = [];
  let error: string | null = null;

  try {
    clauses = await getUnmappedClausesForClient(clientId);
  } catch (err) {
    console.error('[PolicyReview] Failed to load clauses:', err);
    error = err instanceof Error ? err.message : 'Failed to load policy review data.';
  }

  return (
    <PolicyReviewClient
      clauses={clauses}
      error={error}
      clientId={clientId}
    />
  );
}
