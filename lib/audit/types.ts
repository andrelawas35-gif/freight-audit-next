/*
  lib/audit/types.ts — shared types for rule implementations.

  Each rule is a function: (invoice, shipment) => Finding | null
  The engine collects Findings and writes them as Audit Results.
*/

import type { Invoice, Shipment } from '@/lib/types';
import type { Resolver } from './rulebook';

export type RuleCode =
  | 'DIM_WEIGHT_TRAP'
  | 'PHANTOM_ACCESSORIAL'
  | 'DUPLICATE_TRACKING'
  | 'SLA_FAILURE'
  | 'LTL_SLA_FAILURE';

export type Finding = {
  ruleCode: RuleCode;
  outcome: 'FLAGGED' | 'ERROR';
  billedAmount: number;
  expectedAmount: number;
  variance: number;          // billedAmount - expectedAmount (positive = overcharge)
  notes: string;
  invoiceId: string;
  shipmentId?: string;
};

// Context passed to every rule. `resolver` is the layered rulebook
// (contract → carrier → global); `allInvoices` is used by duplicate detection.
export type RuleContext = {
  allInvoices: Invoice[];
  resolver: Resolver;
};

export type RuleFn = (
  invoice: Invoice,
  shipment: Shipment | null,
  ctx: RuleContext
) => Finding | null;

// Helper: derive the rulebook lookup scope from an invoice + shipment.
export function scopeOf(invoice: Invoice, shipment: Shipment | null) {
  return {
    clientId: invoice['Clients']?.[0] ?? null,
    scac: (shipment?.['Carrier'] || invoice['Carrier']?.[0] || '').toUpperCase() || null,
    serviceLevel: shipment?.['Service level'] ?? null,
    shipDate: shipment?.['Ship date'] ?? invoice['Invoice date'] ?? null,
  };
}
