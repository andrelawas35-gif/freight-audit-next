/*
  app/clients/page.tsx — Client gain-share portfolio.

  Data flow:
    1. Fetch Clients, Disputes in parallel
    2. Match disputes to clients
    3. Compute per-client stats (MTD, YTD, Gain-share, win rate)
    4. Pass to interactive ClientsView for the two-pane layout
*/

import { fetchRecords } from '@/lib/airtable';
import { ClientsView } from '@/components/clients-view';

export const dynamic = 'force-dynamic';

// ── Types for computed scorecard ─────────────────────────────────
export type ClientScorecard = {
  totalRecovered: any;
  id: string;
  name: string;
  gainSharePct: number;
  winRate: number;
  disputeCount: number;
  active: boolean;
  recoveredYTD: number;
  recoveredMTD: number;
  openDisputed: number;
  gainShareEarned: number;
  threshold: number;
  lastAudit: string;
  invoiceCount: number;  // ADD this
};
export default async function ClientsPage() {
  let scorecards: ClientScorecard[] = [];
  let disputesRaw: any[] = [];

  try {
    const [clientsData, disputesData] = await Promise.all([
      fetchRecords('Clients', { maxRecords: 100 }),
      fetchRecords('Disputes', { maxRecords: 1000 }),
    ]);

    const clientsRaw = clientsData as any[];
    disputesRaw = disputesData as any[];

    // ── Timeframes for MTD / YTD calculations ──────────────────
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM
    const currentYear = now.toISOString().slice(0, 4);  // YYYY

    // ── Build per-client scorecards ────────────────────────────
    scorecards = (clientsRaw as any[]).map(c => {
      const id = c.id;
      const name = c['Company name'] || 'Unknown';
      const active = c['Contract active'] || false;
      const gainSharePct = c['Gain share pct'] || 0;

      // Match disputes to this client
      const cDisputes = (disputesRaw as any[]).filter(d => {
        const dClient = d['Client'] || d['Clients'] || [];
        // Handle Airtable linked records which come back as arrays
        return Array.isArray(dClient) ? dClient.includes(id) : dClient === id;
      });

      const won = cDisputes.filter(d => d['Status'] === 'Won');
      const resolved = cDisputes.filter(d => ['Won', 'Closed'].includes(d['Status'] || ''));
      const openDisputed = cDisputes.length - resolved.length;

      let recoveredMTD = 0;
      let recoveredYTD = 0;
      let totalRecovered = 0;

      won.forEach(d => {
        const amt = d['Recovery amount'] || 0;
        const date = d['Date resolved'] || d['Resolved date'] || '';
        
        totalRecovered += amt;
        if (date.startsWith(currentMonth)) recoveredMTD += amt;
        if (date.startsWith(currentYear)) recoveredYTD += amt;
      });

      return {
        id,
        name,
        active,
        gainSharePct,
        lastAudit: c['Last audit run'] || '—',
        threshold: c['Min invoice threshold'] || 0,
        disputeCount: cDisputes.length,
        openDisputed,
        winCount: won.length,
        winRate: resolved.length > 0 ? won.length / resolved.length : 0,
        recoveredMTD,
        recoveredYTD,
        totalRecovered,
        gainShareEarned: totalRecovered * (gainSharePct / 100),
        invoiceCount: c['Invoice count'] || 0,
      };
    });

    // Sort active clients to the top, then by recovery volume
    scorecards.sort((a, b) => {
      if (a.active === b.active) return b.totalRecovered - a.totalRecovered;
      return a.active ? -1 : 1;
    });

  } catch (err) {
    console.error('Failed to fetch clients data:', err);
  }

  // ── Aggregate totals ────────────────────────────────────────
  const totals = scorecards.reduce(
    (acc, c) => ({
      recoveredMTD: acc.recoveredMTD + c.recoveredMTD,
      recoveredYTD: acc.recoveredYTD + c.recoveredYTD,
      gainShare: acc.gainShare + c.gainShareEarned,
    }),
    { recoveredMTD: 0, recoveredYTD: 0, gainShare: 0 }
  );

  return <ClientsView scorecards={scorecards} totals={totals} disputes={disputesRaw as any[]} />

}