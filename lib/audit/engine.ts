/*
  lib/audit/engine.ts — orchestrates all rules over a set of invoices.

  Usage (server-side only):
    import { runAudit } from '@/lib/audit/engine';
    const summary = await runAudit({ clientId: 'recXXX' });
*/

import { fetchRecords, createRecord, updateRecord, batchCreate } from '@/lib/airtable';
import type { Invoice, Shipment } from '@/lib/types';
import type { Finding } from './types';

import { dimWeightRule } from './rules/dim-weight';
import { phantomAccessorialRule } from './rules/phantom-accessorial';
import { duplicateTrackingRule } from './rules/duplicate-tracking';
import { slaFailureRule } from './rules/sla-failure';

const ALL_RULES = [
  dimWeightRule,
  phantomAccessorialRule,
  duplicateTrackingRule,
  slaFailureRule,
];

export type AuditSummary = {
  invoicesChecked: number;
  findingsCreated: number;
  totalVariance: number;
  errors: string[];
};

export async function runAudit(options: {
  clientId?: string;   // restrict to one client; omit to audit all
  dryRun?: boolean;    // if true, return findings without writing to Airtable
}): Promise<AuditSummary> {
  const { clientId, dryRun = false } = options;

  // 1. Fetch invoices (filter by client if provided)
  const invoiceFilter = clientId
    ? `FIND("${clientId}", ARRAYJOIN({Clients}))`
    : '';

  const invoices = (await fetchRecords('Invoices', {
    filterByFormula: invoiceFilter || undefined,
    maxRecords: 500,
  })) as Invoice[];

  // 2. Fetch all shipments linked to these invoices
  const shipmentIds = invoices.flatMap((inv) => inv['Shipment'] ?? []);
  const uniqueShipmentIds = [...new Set(shipmentIds)];

  const allShipments = uniqueShipmentIds.length > 0
    ? (await fetchRecords('Shipments', {
        filterByFormula: `OR(${uniqueShipmentIds.map((id) => `RECORD_ID()="${id}"`).join(',')})`,
        maxRecords: 500,
      })) as Shipment[]
    : [];

  const shipmentById = Object.fromEntries(allShipments.map((s) => [s.id, s]));

  // 3. Fetch existing audit result invoice IDs to avoid re-auditing
  const existingResults = await fetchRecords('Audit Results', {
    fields: ['Invoice'],
    maxRecords: 1000,
  });
  const alreadyAudited = new Set(
    existingResults.flatMap((r: any) => r['Invoice'] ?? [])
  );

  // 4. Run rules
  const findings: Finding[] = [];
  const errors: string[] = [];

  for (const invoice of invoices) {
    if (alreadyAudited.has(invoice.id)) continue;

    const shipmentId = invoice['Shipment']?.[0];
    const shipment = shipmentId ? shipmentById[shipmentId] ?? null : null;

    for (const rule of ALL_RULES) {
      try {
        const finding = rule(invoice, shipment, invoices);
        if (finding) findings.push(finding);
      } catch (err) {
        errors.push(`Rule ${rule.name} failed on invoice ${invoice['Invoice number'] ?? invoice.id}: ${err}`);
      }
    }
  }

  // 5. Write findings to Airtable
  if (!dryRun && findings.length > 0) {
    const records = findings.map((f) => ({
      'Invoice': [f.invoiceId],
      'Outcome': f.outcome,
      'Billed amount': f.billedAmount,
      'Expected amount': f.expectedAmount,
      'Variance': f.variance,
      'Notes': f.notes,
      'Audited at': new Date().toISOString(),
      'Detected by': f.ruleCode,
    }));

    await batchCreate('Audit Results', records);
  }

  // 6. Update each client's Last audit run timestamp
  if (!dryRun && clientId) {
    await updateRecord('Clients', clientId, {
      'Last audit run': new Date().toISOString(),
    });
  }

  return {
    invoicesChecked: invoices.length,
    findingsCreated: findings.length,
    totalVariance: findings.reduce((sum, f) => sum + f.variance, 0),
    errors,
  };
}
