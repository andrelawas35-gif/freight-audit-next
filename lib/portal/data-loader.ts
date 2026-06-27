/*
  lib/portal/data-loader.ts — server-side data loader for the portal dashboard.

  Fans out to Recovery (AirTable-backed) and Compliance (SQL-backed) data sources
  and returns a unified payload. Called directly from the server component page.tsx.

  NOT a 'use server' action — it's a plain async function.
*/

import { fetchRecord, fetchRecords } from '@/lib/db/records';
import {
  getInsuranceExposureReport,
  getGatewayReadinessReport,
  getTopGatewayRuleSuggestions,
} from '@/lib/intelligence/reports';
import type {
  InsuranceExposureRow,
  GatewayReadinessRow,
  GatewayRuleSuggestionRow,
} from '@/lib/intelligence/reports';
import type { Dispute, Invoice, Client, AuditResult } from '@/lib/types';

// ── Types ───────────────────────────────────────────────────────

export type ComplianceData = {
  insuranceExposure: InsuranceExposureRow[];
  gatewayReadiness: GatewayReadinessRow[];
  ruleSuggestions: GatewayRuleSuggestionRow[];
};

export type RecoveryData = {
  recovered: number;
  inDispute: number;
  activeCount: number;
  totalCount: number;
  totalSpend: number;
  marginPct: number;
  monthly: { month: string; recovered: number; cumulative: number }[];
  breakdown: { label: string; amount: number; hue: number }[];
  recentRecovered: { id: string; date: string; amount: number }[];
  openDisputes: { id: string; status: string; amount: number }[];
  topCarriers: { carrier: string; amount: number; pct: number }[];
  activity: { id: string; text: string; date: string; tone: string }[];
};

export type PortalDashboardData = {
  companyName: string;
  recovery: RecoveryData;
  compliance: ComplianceData;
};

// ── Helpers (matching page.tsx) ─────────────────────────────────

type PortalDispute = Dispute & { 'Carrier (display)'?: string };

const RULE_META: Record<string, { label: string; hue: number }> = {
  DIM_WEIGHT_TRAP:     { label: 'Dim-weight overcharges', hue: 280 },
  PHANTOM_ACCESSORIAL: { label: 'Residential surcharges', hue: 50 },
  DUPLICATE_TRACKING:  { label: 'Duplicate billing',      hue: 152 },
  SLA_FAILURE:         { label: 'Late deliveries',        hue: 220 },
  LTL_SLA_FAILURE:     { label: 'LTL late deliveries',    hue: 244 },
};

function normalizeRule(raw: string): string {
  const u = (raw || '').toUpperCase().replace(/[\s-]+/g, '_');
  if (u.includes('DIM')) return 'DIM_WEIGHT_TRAP';
  if (u.includes('PHANTOM') || u.includes('ACCESSORIAL') || u.includes('RESIDENTIAL')) return 'PHANTOM_ACCESSORIAL';
  if (u.includes('DUPLICATE')) return 'DUPLICATE_TRACKING';
  if (u.includes('LTL')) return 'LTL_SLA_FAILURE';
  if (u.includes('SLA')) return 'SLA_FAILURE';
  return u || 'OTHER';
}

function monthLabel(key: string) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function shortDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
}

// ── Recovery data fetch ─────────────────────────────────────────

async function fetchRecoveryData(clientId: string): Promise<{
  companyName: string;
  data: RecoveryData;
}> {
  const [client, disputes, invoices, audits] = await Promise.all([
    fetchRecord('Clients', clientId) as Promise<Client>,
    fetchRecords('Disputes', {
      filterByFormula: `{Client} = "${clientId}"`,
      sort: [{ field: 'Opened date', direction: 'desc' }],
      maxRecords: 500,
    }) as Promise<PortalDispute[]>,
    fetchRecords('Invoices', {
      filterByFormula: `{Clients} = "${clientId}"`,
      maxRecords: 1000,
    }) as Promise<Invoice[]>,
    fetchRecords('Audit Results', {
      filterByFormula: `{Client} = "${clientId}"`,
      maxRecords: 1000,
    }) as Promise<AuditResult[]>,
  ]);

  const isResolved = (s?: string) => s === 'Won' || s === 'Closed';
  const won = disputes.filter((d) => d['Status'] === 'Won');
  const open = disputes.filter((d) => !isResolved(d['Status']));

  const recovered = won.reduce((a, d) => a + (d['Recovery amount'] || 0), 0);
  const inDispute = open.reduce((a, d) => a + (d['Disputed amount'] || 0), 0);
  const totalSpend = invoices.reduce((a, i) => a + (i['Amount billed'] || 0), 0);
  const marginPct = totalSpend > 0 ? (recovered / totalSpend) * 100 : 0;

  // Recovery trend
  const byMonth = new Map<string, number>();
  for (const d of won) {
    const iso = d['Date resolved'];
    if (!iso) continue;
    const key = iso.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) || 0) + (d['Recovery amount'] || 0));
  }
  let running = 0;
  const monthly = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, amt]) => {
      running += amt;
      return { month: monthLabel(key), recovered: amt, cumulative: running };
    });

  // Breakdown
  const byRule = new Map<string, number>();
  for (const a of audits) {
    const ruleRaw = a['Detected by'] || (a['Audit Rules']?.[0] ?? '') || '';
    const rule = normalizeRule(String(ruleRaw));
    const amt = a['Variance'] || Math.max(0, (a['Billed amount'] || 0) - (a['Expected amount'] || 0));
    if (amt > 0) byRule.set(rule, (byRule.get(rule) || 0) + amt);
  }
  const breakdown = [...byRule.entries()]
    .map(([rule, amount]) => ({
      label: RULE_META[rule]?.label || rule,
      amount: Math.round(amount),
      hue: RULE_META[rule]?.hue || 70,
    }))
    .sort((a, b) => b.amount - a.amount);

  const recentRecovered = won
    .slice()
    .sort((a, b) => (b['Date resolved'] || '').localeCompare(a['Date resolved'] || ''))
    .slice(0, 8)
    .map((d) => ({
      id: d['Dispute ID'] || d.id.slice(0, 10),
      date: shortDate(d['Date resolved']),
      amount: d['Recovery amount'] || 0,
    }));

  const openDisputes = open.slice(0, 10).map((d) => ({
    id: d['Dispute ID'] || d.id.slice(0, 10),
    status: d['Status'] || 'Open',
    amount: d['Disputed amount'] || 0,
  }));

  const carrierTotals = new Map<string, number>();
  for (const dispute of disputes) {
    const carrier = dispute['Carrier (display)'] || 'Other';
    carrierTotals.set(carrier, (carrierTotals.get(carrier) || 0) + (dispute['Disputed amount'] || 0));
  }
  const totalCarrierAmount = [...carrierTotals.values()].reduce((sum, amount) => sum + amount, 0);
  const topCarriers = [...carrierTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([carrier, amount]) => ({
      carrier,
      amount,
      pct: totalCarrierAmount > 0 ? Math.round((amount / totalCarrierAmount) * 100) : 0,
    }));

  const activity = disputes.slice(0, 5).map((dispute) => ({
    id: dispute.id,
    text:
      dispute.Status === 'Won'
        ? `${dispute['Dispute ID'] || 'Claim'} recovered ${Math.round(
            dispute['Recovery amount'] || 0
          ).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`
        : `${dispute['Dispute ID'] || 'Claim'} moved to ${dispute.Status || 'Open'}`,
    date: shortDate(
      dispute['Date resolved'] || dispute['Carrier response date'] || dispute['Opened date']
    ),
    tone:
      dispute.Status === 'Won'
        ? 'green'
        : dispute.Status === 'Escalated'
          ? 'red'
          : 'neutral',
  }));

  return {
    companyName: client?.['Company name'] || 'Your dashboard',
    data: {
      recovered,
      inDispute,
      activeCount: open.length,
      totalCount: disputes.length,
      totalSpend,
      marginPct,
      monthly,
      breakdown,
      recentRecovered,
      openDisputes,
      topCarriers,
      activity,
    },
  };
}

// ── Compliance data fetch ───────────────────────────────────────

async function fetchComplianceData(clientId: string): Promise<ComplianceData> {
  const [insuranceExposure, gatewayReadiness, ruleSuggestions] = await Promise.all([
    getInsuranceExposureReport({ clientId, months: 6 }),
    getGatewayReadinessReport({ clientId, months: 6 }),
    getTopGatewayRuleSuggestions({ clientId, limit: 5 }),
  ]);
  return { insuranceExposure, gatewayReadiness, ruleSuggestions };
}

// ── Unified data loader ─────────────────────────────────────────

export async function getPortalDashboardData(
  clientId: string
): Promise<PortalDashboardData> {
  let recovery: RecoveryData = {
    recovered: 0,
    inDispute: 0,
    activeCount: 0,
    totalCount: 0,
    totalSpend: 0,
    marginPct: 0,
    monthly: [],
    breakdown: [],
    recentRecovered: [],
    openDisputes: [],
    topCarriers: [],
    activity: [],
  };
  let compliance: ComplianceData = {
    insuranceExposure: [],
    gatewayReadiness: [],
    ruleSuggestions: [],
  };
  let companyName = 'Your dashboard';

  const [recoveryResult, complianceResult] = await Promise.allSettled([
    fetchRecoveryData(clientId),
    fetchComplianceData(clientId),
  ]);

  if (recoveryResult.status === 'fulfilled') {
    recovery = recoveryResult.value.data;
    companyName = recoveryResult.value.companyName;
  } else {
    console.error('Recovery data fetch failed:', recoveryResult.reason);
  }

  if (complianceResult.status === 'fulfilled') {
    compliance = complianceResult.value;
  } else {
    console.error('Compliance data fetch failed:', complianceResult.reason);
  }

  return { companyName, recovery, compliance };
}
