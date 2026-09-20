/*
  lib/audit/3pl-rules.ts — audit rules for staged 3PL invoice lines.

  These run against the tpl_fulfillment_lines / tpl_storage_lines staging tables
  and resolve thresholds from the layered rulebook (contract → carrier → global).
  Every finding carries the MSA clause citation (resolver.clause) so disputes are
  documented automatically.

  Pricing-model gate: the freight-markup rule only applies to cost-plus contracts,
  and raises a DATA_REQUIRED finding when the underlying carrier cost is missing.
*/

import type { Resolver, ResolveOpts } from './rulebook';

export type TplFulfillmentRow = {
  id: string;
  client_id: string | null;
  carrier_scac: string | null;
  invoice_cycle: string | null;
  order_id: string | null;
  units_picked: number | null;
  base_pick_fee: number | null;
  additional_pick_fee: number | null;
  packaging_fee: number | null;
  base_freight: number | null;
  fuel_surcharge: number | null;
  total_billed: number | null;
  base_carrier_cost: number | null;
  match_status: string;
};

export type TplStorageRow = {
  id: string;
  client_id: string | null;
  invoice_cycle: string | null;
  storage_type: string | null;
  billed_amount: number | null;
};

export type TplFinding = {
  ruleCode: string;
  clauseRef: string | null;
  billed: number;
  expected: number;
  variance: number;
  notes: string;
  orderId: string | null;
  clientId: string | null;
  scac: string | null;
  lineId: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.01;

function scopeOf(line: TplFulfillmentRow, serviceLevel: string | null = null): ResolveOpts {
  return {
    clientId: line.client_id,
    scac: line.carrier_scac,
    serviceLevel,
    shipDate: line.invoice_cycle ? `${line.invoice_cycle}-01` : null,
  };
}

function cite(clause: string | null) {
  return clause ? ` [${clause}]` : '';
}

// ── Pick / fulfillment fee compliance ───────────────────────
export function pickFeeRule(line: TplFulfillmentRow, R: Resolver): TplFinding | null {
  if (line.base_pick_fee == null && line.units_picked == null) return null;
  const scope = scopeOf(line);
  const units = line.units_picked ?? 1;

  const expBase = R.num('pick_base_fee', scope, line.base_pick_fee ?? 0);
  const expAddl = R.num('pick_additional_fee', scope, line.additional_pick_fee ?? 0);
  const expected = r2(expBase + Math.max(0, units - 1) * expAddl);

  const billed = r2((line.base_pick_fee ?? 0) + Math.max(0, units - 1) * (line.additional_pick_fee ?? 0));
  const variance = r2(billed - expected);
  if (variance <= EPS) return null;

  const clause = R.clause('pick_base_fee', scope);
  return {
    ruleCode: 'TPL_PICK_FEE', clauseRef: clause, billed, expected, variance,
    notes: `Pick fee overcharge: billed $${billed.toFixed(2)} vs contract $${expected.toFixed(2)} for ${units} unit(s).${cite(clause)}`,
    orderId: line.order_id, clientId: line.client_id, scac: line.carrier_scac, lineId: line.id,
  };
}

// ── Packaging material fee ──────────────────────────────────
export function packagingRule(line: TplFulfillmentRow, R: Resolver): TplFinding | null {
  if (line.packaging_fee == null) return null;
  const scope = scopeOf(line);
  const expected = r2(R.num('packaging_fee', scope, line.packaging_fee));
  const billed = r2(line.packaging_fee);
  const variance = r2(billed - expected);
  if (variance <= EPS) return null;
  const clause = R.clause('packaging_fee', scope);
  return {
    ruleCode: 'TPL_PACKAGING', clauseRef: clause, billed, expected, variance,
    notes: `Packaging fee overcharge: billed $${billed.toFixed(2)} vs contract $${expected.toFixed(2)}.${cite(clause)}`,
    orderId: line.order_id, clientId: line.client_id, scac: line.carrier_scac, lineId: line.id,
  };
}

// ── Freight markup (cost-plus only) + data-requirement gate ──
export function freightMarkupRule(line: TplFulfillmentRow, R: Resolver): TplFinding | null {
  const scope = scopeOf(line);
  const model = R.text('pricing_model', scope, 'fixed_rate');
  if (model !== 'cost_plus') return null; // fixed-rate audits against the rate card, not markup

  const billedFreight = r2((line.base_freight ?? 0) + (line.fuel_surcharge ?? 0));

  if (line.base_carrier_cost == null) {
    return {
      ruleCode: 'TPL_DATA_REQUIRED', clauseRef: R.clause('pricing_model', scope),
      billed: billedFreight, expected: 0, variance: 0,
      notes: `Cost-plus contract: original carrier base cost is required to audit the markup. Request the underlying carrier invoice for order ${line.order_id ?? '(unknown)'}.`,
      orderId: line.order_id, clientId: line.client_id, scac: line.carrier_scac, lineId: line.id,
    };
  }

  const markup = R.num('freight_markup_pct', scope, 0);
  const expected = r2(line.base_carrier_cost * (1 + markup / 100));
  const variance = r2(billedFreight - expected);
  if (variance <= EPS) return null;
  const clause = R.clause('freight_markup_pct', scope);
  return {
    ruleCode: 'TPL_FREIGHT_MARKUP', clauseRef: clause, billed: billedFreight, expected, variance,
    notes: `Freight markup padding: billed $${billedFreight.toFixed(2)} vs cost $${line.base_carrier_cost.toFixed(2)} + ${markup}% = $${expected.toFixed(2)}.${cite(clause)}`,
    orderId: line.order_id, clientId: line.client_id, scac: line.carrier_scac, lineId: line.id,
  };
}

// ── Ghost shipment (billed for an order we have no record of) ─
export function ghostRule(line: TplFulfillmentRow): TplFinding | null {
  if (line.match_status !== 'unmatched') return null;
  const billed = r2(line.total_billed ?? 0);
  return {
    ruleCode: 'TPL_GHOST_SHIPMENT', clauseRef: null, billed, expected: 0, variance: billed,
    notes: `Possible ghost shipment: billed for order ${line.order_id ?? '(unknown)'} with no matching client order. Demand POD/BOL.`,
    orderId: line.order_id, clientId: line.client_id, scac: line.carrier_scac, lineId: line.id,
  };
}

// ── Duplicate across billing cycles (engine supplies the flag) ─
export function duplicateFinding(line: TplFulfillmentRow, priorCycle: string): TplFinding {
  const billed = r2(line.total_billed ?? 0);
  return {
    ruleCode: 'TPL_DUPLICATE', clauseRef: null, billed, expected: 0, variance: billed,
    notes: `Duplicate billing: order ${line.order_id ?? '(unknown)'} already billed in cycle ${priorCycle}.`,
    orderId: line.order_id, clientId: line.client_id, scac: line.carrier_scac, lineId: line.id,
  };
}

// ── Storage tier rate ───────────────────────────────────────
export function storageRule(line: TplStorageRow, R: Resolver): TplFinding | null {
  if (line.billed_amount == null) return null;
  const scope: ResolveOpts = {
    clientId: line.client_id, scac: null,
    serviceLevel: line.storage_type,
    shipDate: line.invoice_cycle ? `${line.invoice_cycle}-01` : null,
  };
  const expected = r2(R.num('storage_rate', scope, line.billed_amount));
  const billed = r2(line.billed_amount);
  const variance = r2(billed - expected);
  if (variance <= EPS) return null;
  const clause = R.clause('storage_rate', scope);
  return {
    ruleCode: 'TPL_STORAGE', clauseRef: clause, billed, expected, variance,
    notes: `Storage overcharge (${line.storage_type ?? 'tier'}): billed $${billed.toFixed(2)} vs contract $${expected.toFixed(2)}.${cite(clause)}`,
    orderId: null, clientId: line.client_id, scac: null, lineId: line.id,
  };
}

export const FULFILLMENT_RULES = [pickFeeRule, packagingRule, freightMarkupRule, ghostRule];
