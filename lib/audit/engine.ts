/*
  lib/audit/engine.ts — orchestrates all rules over a set of invoices.

  Usage (server-side only):
    import { runAudit } from '@/lib/audit/engine';
    const summary = await runAudit({ clientId: 'recXXX' });
*/

import { getSql } from '@/lib/db';
import {
  fetchAllRecords,
  fetchRecordsByIds,
  fetchRecordsByLinkedIds,
  updateRecord,
  batchCreate,
} from '@/lib/db/records';
import type { Invoice, Shipment } from '@/lib/types';
import type { Finding } from './types';
import { loadRulebook, createResolver } from './rulebook';
import { defaultGatewayTagForRule, gatewayTagToFields } from '@/lib/intelligence/taxonomy';
import { log } from '@/lib/logger';

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
  runStartedAt?: string; // ISO timestamp — only process records created on or before this
}): Promise<AuditSummary> {
  const { clientId, dryRun = false, runStartedAt } = options;

  log.info('audit run starting', { clientId: clientId ?? 'all', dryRun, runStartedAt });

  // 1. Fetch invoices (filter by client if provided)
  const invoiceFilter = clientId
    ? `{Clients} = "${clientId}"`
    : '';

  const invoices = (await fetchAllRecords('Invoices', {
    filterByFormula: invoiceFilter || undefined,
    createdBefore: runStartedAt,
  })) as Invoice[];

  // 2. Fetch all shipments linked to these invoices
  const shipmentIds = invoices.flatMap((inv) => inv['Shipment'] ?? []);
  const uniqueShipmentIds = [...new Set(shipmentIds)];

  const allShipments = uniqueShipmentIds.length > 0
    ? (await fetchRecordsByIds('Shipments', uniqueShipmentIds)) as Shipment[]
    : [];

  const shipmentById = Object.fromEntries(allShipments.map((s) => [s.id, s]));

  // 3. Fetch existing audit result invoice IDs to avoid re-auditing
  const existingResults = await fetchRecordsByLinkedIds(
    'Audit Results',
    'Invoice',
    invoices.map((invoice) => invoice.id)
  );
  const alreadyAudited = new Set(
    existingResults.flatMap((r: any) => r['Invoice'] ?? [])
  );

  log.info('audit data loaded', {
    invoices: invoices.length,
    shipments: allShipments.length,
    alreadyAudited: alreadyAudited.size,
  });

  // 4. Load the layered rulebook once and build the resolver
  const rulebookRows = await loadRulebook();
  const resolver = createResolver(rulebookRows);
  const ctx = { allInvoices: invoices, resolver };

  // 5. Run rules
  const findings: Finding[] = [];
  const errors: string[] = [];

  for (const invoice of invoices) {
    if (alreadyAudited.has(invoice.id)) continue;

    const shipmentId = invoice['Shipment']?.[0];
    const shipment = shipmentId ? shipmentById[shipmentId] ?? null : null;

    for (const rule of ALL_RULES) {
      try {
        const finding = rule(invoice, shipment, ctx);
        if (finding) findings.push(finding);
      } catch (err) {
        const msg = `Rule ${rule.name} failed on invoice ${invoice['Invoice number'] ?? invoice.id}: ${err}`;
        errors.push(msg);
        log.warn('rule execution failed', { rule: rule.name, invoiceId: invoice.id, err: err as Error });
      }
    }
  }

  // 6. Write findings + update client timestamp atomically
  if (!dryRun && findings.length > 0) {
    const sql = getSql();
    await sql.query('BEGIN');
    try {
      const auditedAt = new Date().toISOString();
      const records = findings.map((f) => {
        const gateway = f.gateway ?? defaultGatewayTagForRule(f.ruleCode, f.variance);
        return {
          'Invoice': [f.invoiceId],
          'Outcome': f.outcome,
          'Billed amount': f.billedAmount,
          'Expected amount': f.expectedAmount,
          'Variance': f.variance,
          'Notes': f.notes,
          'Audited at': auditedAt,
          'Detected by': f.ruleCode,
          ...gatewayTagToFields(gateway),
        };
      });
      await batchCreate('Audit Results', records, { inTransaction: true });

      if (clientId) {
        await updateRecord('Clients', clientId, {
          'Last audit run': new Date().toISOString(),
        });
      }
      await sql.query('COMMIT');
    } catch (err) {
      await sql.query('ROLLBACK');
      throw err;
    }
  } else if (!dryRun && clientId) {
    await updateRecord('Clients', clientId, {
      'Last audit run': new Date().toISOString(),
    });
  }

  const summary = {
    invoicesChecked: invoices.length,
    findingsCreated: findings.length,
    totalVariance: findings.reduce((sum, f) => sum + f.variance, 0),
    errors,
  };

  log.info('audit run completed', {
    clientId: clientId ?? 'all',
    dryRun,
    invoicesChecked: summary.invoicesChecked,
    findingsCreated: summary.findingsCreated,
    totalVariance: summary.totalVariance,
    errorCount: errors.length,
  });

  return summary;
}
