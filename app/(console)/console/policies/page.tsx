import { PoliciesDashboard } from '@/components/console/policy-intelligence';
import { ConsoleErrorState } from '@/components/ui/primitives';
import { listClientOptions, listPolicies } from '@/lib/intelligence/policy-service';

export const dynamic = 'force-dynamic';

export default async function PoliciesPage() {
  try {
    const [policies, clients] = await Promise.all([
      listPolicies(),
      listClientOptions(),
    ]);

    return <PoliciesDashboard policies={policies} clients={clients} />;
  } catch (err) {
    return (
      <ConsoleErrorState
        heading="Policy Intelligence is not ready"
        message={err instanceof Error ? err.message : String(err)}
        hint="Apply db/migrations/0005_policy_intelligence_mvp.sql, then reload this page."
      />
    );
  }
}
