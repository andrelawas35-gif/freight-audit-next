/*
  lib/audit/3pl-engine.ts - paginated 3PL audit orchestration.

  Pending fulfillment and storage lines are processed in bounded pages. Each
  page writes its findings before marking exactly those source lines audited,
  preventing both silent truncation and unbounded serverless memory growth.
*/

import { getSql } from '@/lib/db';
import { batchCreate } from '@/lib/db/records';
import { loadRulebook, createResolver } from './rulebook';
import { recordRun } from './runs';
import { log } from '@/lib/logger';
import { defaultGatewayTagForRule, gatewayTagToFields } from '@/lib/intelligence/taxonomy';
import {
  FULFILLMENT_RULES,
  storageRule,
  duplicateFinding,
  type TplFulfillmentRow,
  type TplStorageRow,
  type TplFinding,
} from './3pl-rules';

export type ThreePLAuditSummary = {
  linesChecked: number;
  findingsCreated: number;
  totalVariance: number;
  errors: string[];
};

const AUDIT_PAGE_SIZE = 500;

export async function runThreePLAudit(opts: {
  clientId?: string;
  cycle?: string;
  triggeredBy?: string | null;
  runStartedAt?: string;
}): Promise<ThreePLAuditSummary> {
  const sql = getSql();
  const errors: string[] = [];
  const baseWhere: string[] = [`audit_status = 'pending'`];
  const baseParams: unknown[] = [];

  if (opts.runStartedAt) {
    baseParams.push(opts.runStartedAt);
    baseWhere.push(`created_at <= $${baseParams.length}::timestamptz`);
  }
  if (opts.clientId) {
    baseParams.push(opts.clientId);
    baseWhere.push(`client_id = $${baseParams.length}`);
  }
  if (opts.cycle) {
    baseParams.push(opts.cycle);
    baseWhere.push(`invoice_cycle = $${baseParams.length}`);
  }

  const resolver = createResolver(await loadRulebook());
  let linesChecked = 0;
  let findingsCreated = 0;
  let totalVariance = 0;

  log.info('3PL audit starting', { clientId: opts.clientId ?? 'all', cycle: opts.cycle ?? 'all' });

  async function persistPage(
    table: 'tpl_fulfillment_lines' | 'tpl_storage_lines',
    lineIds: string[],
    findings: TplFinding[]
  ) {
    // Findings + mark-audited must be atomic — a crash between them would
    // leave lines marked pending with findings already written (double-audit)
    // or findings missing with lines marked audited (lost findings).
    await sql.query('BEGIN');
    try {
      if (findings.length) {
        const auditedAt = new Date().toISOString();
        await batchCreate('Audit Results', findings.map((finding) => {
          const gateway = defaultGatewayTagForRule(finding.ruleCode, finding.variance);
          return {
            'Outcome': 'FLAGGED',
            'Detected by': finding.ruleCode,
            'Billed amount': finding.billed,
            'Expected amount': finding.expected,
            'Variance': finding.variance,
            'Notes': finding.notes,
            'Audited at': auditedAt,
            'Carrier SCAC': finding.scac ?? undefined,
            'Client': finding.clientId ? [finding.clientId] : undefined,
            'Invoice number': finding.orderId ?? undefined,
            ...gatewayTagToFields(gateway),
          };
        }), { inTransaction: true });
      }

      if (lineIds.length) {
        await sql.query(
          `UPDATE ${table} SET audit_status='audited' WHERE id = ANY($1::text[])`,
          [lineIds]
        );
      }
      await sql.query('COMMIT');
    } catch (err) {
      await sql.query('ROLLBACK');
      throw err;
    }

    linesChecked += lineIds.length;
    findingsCreated += findings.length;
    totalVariance += findings.reduce((sum, finding) => sum + finding.variance, 0);
  }

  let fulfillmentCursor: string | null = null;
  while (true) {
    const params = [...baseParams];
    const where = [...baseWhere];
    if (fulfillmentCursor) {
      params.push(fulfillmentCursor);
      where.push(`id > $${params.length}`);
    }
    params.push(AUDIT_PAGE_SIZE);

    const page = (await sql.query(
      `SELECT id, client_id, carrier_scac, invoice_cycle, order_id, units_picked,
              base_pick_fee, additional_pick_fee, packaging_fee, base_freight, fuel_surcharge,
              total_billed, base_carrier_cost, match_status
         FROM tpl_fulfillment_lines
        WHERE ${where.join(' AND ')}
        ORDER BY id ASC
        LIMIT $${params.length}`,
      params
    )) as TplFulfillmentRow[];

    if (!page.length) break;

    const clientIds = [...new Set(page.map((line) => line.client_id).filter(Boolean))] as string[];
    const earliestByOrder = new Map<string, string>();
    if (clientIds.length) {
      const firstCycles = (await sql.query(
        `SELECT client_id, order_id, min(invoice_cycle) AS first_cycle
           FROM tpl_fulfillment_lines
          WHERE order_id IS NOT NULL AND client_id = ANY($1::text[])
          GROUP BY client_id, order_id`,
        [clientIds]
      )) as { client_id: string; order_id: string; first_cycle: string }[];
      for (const row of firstCycles) {
        earliestByOrder.set(`${row.client_id}|${row.order_id}`, row.first_cycle);
      }
    }

    const findings: TplFinding[] = [];
    for (const line of page) {
      for (const rule of FULFILLMENT_RULES) {
        try {
          const finding = rule(line, resolver);
          if (finding) findings.push(finding);
        } catch (err) {
          errors.push(`${rule.name} failed on line ${line.id}: ${err}`);
        }
      }

      if (line.order_id && line.invoice_cycle) {
        const firstCycle = earliestByOrder.get(`${line.client_id}|${line.order_id}`);
        if (firstCycle && firstCycle < line.invoice_cycle) {
          findings.push(duplicateFinding(line, firstCycle));
        }
      }
    }

    await persistPage('tpl_fulfillment_lines', page.map((line) => line.id), findings);
    fulfillmentCursor = page[page.length - 1].id;
    if (page.length < AUDIT_PAGE_SIZE) break;
  }

  let storageCursor: string | null = null;
  while (true) {
    const params = [...baseParams];
    const where = [...baseWhere];
    if (storageCursor) {
      params.push(storageCursor);
      where.push(`id > $${params.length}`);
    }
    params.push(AUDIT_PAGE_SIZE);

    const page = (await sql.query(
      `SELECT id, client_id, invoice_cycle, storage_type, billed_amount
         FROM tpl_storage_lines
        WHERE ${where.join(' AND ')}
        ORDER BY id ASC
        LIMIT $${params.length}`,
      params
    )) as TplStorageRow[];

    if (!page.length) break;

    const findings: TplFinding[] = [];
    for (const line of page) {
      try {
        const finding = storageRule(line, resolver);
        if (finding) findings.push(finding);
      } catch (err) {
        errors.push(`storageRule failed on line ${line.id}: ${err}`);
      }
    }

    await persistPage('tpl_storage_lines', page.map((line) => line.id), findings);
    storageCursor = page[page.length - 1].id;
    if (page.length < AUDIT_PAGE_SIZE) break;
  }

  try {
    await recordRun({
      clientId: opts.clientId ?? null,
      clientName: opts.cycle ? `3PL - ${opts.cycle}` : '3PL audit',
      dryRun: false,
      status: 'success',
      invoicesChecked: linesChecked,
      findingsCreated,
      totalVariance,
      errors,
      triggeredBy: opts.triggeredBy ?? null,
    });
  } catch (err) {
    errors.push(`recordRun failed: ${err}`);
  }

  log.info('3PL audit completed', {
    clientId: opts.clientId ?? 'all',
    cycle: opts.cycle ?? 'all',
    linesChecked,
    findingsCreated,
    totalVariance,
    errorCount: errors.length,
  });

  return { linesChecked, findingsCreated, totalVariance, errors };
}
