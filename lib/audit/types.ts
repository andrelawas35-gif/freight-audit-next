/*
  lib/audit/types.ts — shared types for rule implementations.

  Each rule is a function: (invoice, shipment) => Finding | null
  The engine collects Findings and writes them as Audit Results.
*/

import type { Invoice, Shipment } from '@/lib/types';

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

export type RuleFn = (
  invoice: Invoice,
  shipment: Shipment | null,
  allInvoices?: Invoice[]   // needed for duplicate detection
) => Finding | null;
