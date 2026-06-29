import { notFound } from 'next/navigation';
import { PolicyDetailWorkbench } from '@/components/console/policy-intelligence';
import { ConsoleErrorState } from '@/components/ui/primitives';
import { getPolicyDetail } from '@/lib/intelligence/policy-service';

export const dynamic = 'force-dynamic';

export default async function PolicyDetailPage({
  params,
}: {
  params: Promise<{ policyId: string }>;
}) {
  const { policyId } = await params;

  try {
    const detail = await getPolicyDetail(policyId);
    if (!detail) notFound();

    return (
      <PolicyDetailWorkbench
        policy={detail.policy}
        documents={detail.documents}
        rulesets={detail.rulesets}
        rules={detail.rules}
        runs={detail.runs}
      />
    );
  } catch (err) {
    return (
      <ConsoleErrorState
        heading="Policy detail failed to load"
        message={err instanceof Error ? err.message : String(err)}
        hint="Confirm the Policy Intelligence migration has been applied."
      />
    );
  }
}
