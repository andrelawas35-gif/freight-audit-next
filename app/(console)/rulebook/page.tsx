/*
  app/(console)/rulebook/page.tsx — Rulebook editor (staff).

  Edit the layered audit thresholds: global defaults, carrier overrides, and
  per-client contract terms. The engine resolves contract → carrier → global.
*/

import { fetchRecords } from '@/lib/airtable';
import { loadRulebook } from '@/lib/audit/rulebook';
import { AddRule, RulesTable } from '@/components/console/rulebook-admin';
import type { Client, Carrier } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function RulebookPage() {
  let rows: Awaited<ReturnType<typeof loadRulebook>> = [];
  let clients: { id: string; name: string }[] = [];
  let carriers: { id: string; name: string }[] = [];

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
    console.error('Rulebook page load failed:', err);
  }

  const clientNames = Object.fromEntries(clients.map((c) => [c.id, c.name]));

  return (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1100, margin: '0 auto' }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 800 }}>Rulebook</h1>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>
          Audit thresholds by scope. Most specific wins: a client contract overrides the
          carrier standard, which overrides the global default.
        </p>
      </div>

      <AddRule clients={clients} carriers={carriers} />
      <RulesTable rows={rows} clientNames={clientNames} />
    </div>
  );
}
