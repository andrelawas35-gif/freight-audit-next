/*
  app/(portal)/portal/page.tsx — client dashboard (server data + client UI).

  Fetches everything scoped to the signed-in user's client via the unified
  portalDataLoader, derives KPIs, recovery trend, and the carrier/error
  breakdown, then hands plain data to the interactive <Dashboard> client
  component.

  Dual-tab: Recovery (default) and Compliance.
*/

import { auth } from '@/auth';
import { getPortalDashboardData } from '@/lib/portal/data-loader';
import { Dashboard } from '@/components/portal/dashboard';

export const dynamic = 'force-dynamic';

export default async function PortalDashboard({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  const clientId = session?.user?.clientId;

  if (!clientId) {
    return (
      <div style={{ color: 'var(--ink-2)', fontSize: 14 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Welcome</h1>
        <p>
          Your account isn't linked to a client company yet. Please contact your Aurelian Collective
          account manager to finish setup.
        </p>
      </div>
    );
  }

  const { tab: tabParam } = await searchParams;
  const activeTab = tabParam === 'compliance' ? 'compliance' : 'recovery';

  const data = await getPortalDashboardData(clientId);

  return (
    <Dashboard
      companyName={data.companyName}
      recovered={data.recovery.recovered}
      inDispute={data.recovery.inDispute}
      activeCount={data.recovery.activeCount}
      totalCount={data.recovery.totalCount}
      totalSpend={data.recovery.totalSpend}
      marginPct={data.recovery.marginPct}
      monthly={data.recovery.monthly}
      breakdown={data.recovery.breakdown}
      recentRecovered={data.recovery.recentRecovered}
      openDisputes={data.recovery.openDisputes}
      topCarriers={data.recovery.topCarriers}
      activity={data.recovery.activity}
      complianceData={data.compliance}
      activeTab={activeTab}
      clientId={clientId}
    />
  );
}
