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

  // 6. Write findings + update client timestamp atomically.
  //    Uses sql.transaction() (Neon documented API, CLAUDE.md invariant #3).
  //    All INSERTs + UPDATE are bundled into a single atomic transaction.
  if (!dryRun && findings.length > 0) {
    const sql = getSql();
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

    await sql.transaction((txn) => {
      const queries: ReturnType<typeof txn.query>[] = [];

      // Build INSERT queries for each finding (replaces batchCreate inline)
      for (const fields of records) {
        const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
        if (entries.length === 0) {
          queries.push(txn.query(
            `INSERT INTO "Audit Results" DEFAULT VALUES RETURNING *`, []
          ));
        } else {
          const cols = entries.map(([k]) => `"${k}"`).join(', ');
          const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
          const values = entries.map(([, v]) => v);
          queries.push(txn.query(
            `INSERT INTO "Audit Results" (${cols}) VALUES (${placeholders}) RETURNING *`,
            values
          ));
        }
      }

      // Update client's last-audit timestamp within the same transaction
      if (clientId) {
        queries.push(txn.query(
          `UPDATE "Clients" SET "Last audit run" = $1 WHERE id = $2`,
          [auditedAt, clientId]
        ));
      }

      return queries;
    });
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
