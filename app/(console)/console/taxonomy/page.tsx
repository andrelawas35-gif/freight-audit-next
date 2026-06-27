import { auth } from '@/auth';
import { ConsoleErrorState, ConsoleEmptyState, SectionLabel } from '@/components/ui/primitives';
import { getTaxonomyCandidates } from '@/lib/intelligence/policy-service';
import { TaxonomyReviewClient } from './taxonomy-review-client';

export const dynamic = 'force-dynamic';

export default async function TaxonomyPage() {
  let candidates: Awaited<ReturnType<typeof getTaxonomyCandidates>> = [];
  let loadError: string | null = null;
  let isTaxonomyAdmin = false;
  const counts = { captured: 0, extractable: 0, enforceable: 0, rejected: 0 };

  try {
    const session = await auth();
    isTaxonomyAdmin = session?.user?.isTaxonomyAdmin ?? false;

    candidates = await getTaxonomyCandidates();
    for (const c of candidates) {
      const status = c.lifecycleStatus as keyof typeof counts;
      if (status in counts) counts[status]++;
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div style={{ padding: 14, maxWidth: 1340, margin: '0 auto', width: '100%' }}>
      {loadError ? (
        <ConsoleErrorState
          heading="Couldn't load taxonomy candidates"
          message={loadError}
          hint="Check database connectivity and ensure migration 0014 has been applied."
        />
      ) : (
        <>
          <SectionLabel>Taxonomy Discovery</SectionLabel>
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 0, marginBottom: 14 }}>
            Novel policy variables detected across all clients. Promotion adds the variable to the
            extractor's vocabulary so future contracts are scanned for it. Promote → extractable.
            Enforceable requires a separate engineering change (PolicyCondition key + evaluator branch).
            {!isTaxonomyAdmin && (
              <span style={{ color: 'var(--ink-3)' }}> Staff may view and reject; only taxonomy_admin may promote.</span>
            )}
          </p>

          <TaxonomyReviewClient
            candidates={candidates}
            isTaxonomyAdmin={isTaxonomyAdmin}
            counts={counts}
          />
        </>
      )}
    </div>
  );
}
