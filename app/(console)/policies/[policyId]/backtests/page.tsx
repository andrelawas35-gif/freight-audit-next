import { notFound } from 'next/navigation';
import { PolicyBacktestsWorkbench } from '@/components/console/policy-intelligence';
import { ConsoleErrorState } from '@/components/ui/primitives';
import { getPolicyDetail, listBacktestResults } from '@/lib/intelligence/policy-service';

export const dynamic = 'force-dynamic';

export default async function PolicyBacktestsPage({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  const { policyId } = await params;

  try {
    const detail = await getPolicyDetail(policyId);
    if (!detail) notFound();

    const latestRunId = detail.runs[0]?.id;
    const results = latestRunId ? await listBacktestResults(latestRunId) : [];

    return (
      <PolicyBacktestsWorkbench
        policy={detail.policy}
        rulesets={detail.rulesets}
        runs={detail.runs}
        results={results}
      />
    );
  } catch (err) {
    return (
      <ConsoleErrorState
        heading="Policy backtests failed to load"
        message={err instanceof Error ? err.message : String(err)}
        hint="Confirm the Policy Intelligence migration has been applied."
      />
    );
  }
}
