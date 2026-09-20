/*
  app/(console)/rulebook/page.tsx — Rulebook editor (staff).

  Edit the layered audit thresholds: global defaults, carrier overrides, and
  per-client contract terms. The engine resolves contract → carrier → global.
*/

import { fetchRecords } from '@/lib/db/records';
import { loadRulebook } from '@/lib/audit/rulebook';
import { AddRule, RulesTable } from '@/components/console/rulebook-admin';
import { KPI, SectionLabel, ConsoleErrorState } from '@/components/ui/primitives';
import type { Client, Carrier } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function RulebookPage() {
  let rows: Awaited<ReturnType<typeof loadRulebook>> = [];
  let clients: { id: string; name: string }[] = [];
  let carriers: { id: string; name: string }[] = [];
  let loadError: string | null = null;

  try {
    const [rb, clientsRaw, carriersRaw] = await Promise.all([
      loadRulebook(),
      fetchRecords('Clients', { maxRecords: 500, fields: ['Company name'] }),
      fetchRecords('Carriers', { maxRecords: 200, fields: ['SCAC', 'Carrier name'] }),
    ]);
    rows = rb;
    clients = (clientsRaw as Client[])
      .map((c) => ({ id: c.id, name: c['Company name'] || c.id }))
      .sort((a, b) => a.name.localeCompare(b.name));
    carriers = (carriersRaw as Carrier[])
      .filter((c) => c['SCAC'])
      .map((c) => ({ id: c.id, name: c['SCAC'] as string }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    console.error('Rulebook page load failed:', err);
  }

  if (loadError) {
    return (
      <div style={{ padding: 14, maxWidth: 1100, margin: '0 auto' }}>
        <ConsoleErrorState
          heading="Couldn't load rulebook"
          message={loadError}
          hint="Check DATABASE_URL and database connectivity, then reload the page."
        />
      </div>
    );
  }

  const clientNames = Object.fromEntries(clients.map((c) => [c.id, c.name]));

  const globalCount = rows.filter((r) => r.scope === 'global').length;
  const carrierCount = rows.filter((r) => r.scope === 'carrier').length;
  const contractCount = rows.filter((r) => r.scope === 'contract').length;

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100, margin: '0 auto' }}>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KPI
          label="Total rules"
          accentBar="var(--blue)"
          value={String(rows.length)}
          sub="active thresholds"
        />
        <KPI
          label="Global defaults"
          value={String(globalCount)}
          sub="base thresholds"
        />
        <KPI
          label="Carrier overrides"
          tone={carrierCount > 0 ? 'amber' : 'ink'}
          value={String(carrierCount)}
          sub="carrier-specific"
        />
        <KPI
          label="Client contracts"
          tone={contractCount > 0 ? 'green' : 'ink'}
          value={String(contractCount)}
          sub="highest precedence"
        />
      </div>

      {/* Add rule form */}
      <div>
        <SectionLabel>Add / override a rule</SectionLabel>
        <AddRule clients={clients} carriers={carriers} />
      </div>

      {/* Rules table */}
      <div>
        <SectionLabel right={
          <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
            contract → carrier → global
          </span>
        }>Active rules</SectionLabel>
        <RulesTable rows={rows} clientNames={clientNames} />
      </div>
    </div>
  );
}
