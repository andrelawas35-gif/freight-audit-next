/*
  lib/ingestion/carriers/from-edi.ts

  Converts a parsed EDI 210 record into a NormalizedInvoice.
  Works for any carrier that sends EDI 210 (FedEx, UPS, ODFL, SAIA, etc.)
*/

import type { NormalizedInvoice } from '../schema';
import type { EdiRawInvoice } from '../edi/parser';
import { ediDateToIso } from '../edi/parser';
import { type MappingContext, baselineMappingContext } from '../mappings';

// L1 codes that represent the base freight charge (not accessorials)
const BASE_CHARGE_CODES = new Set(['FR', 'LH', 'BASE', 'FREIGHT', '0', '400', '401']);

export function normalizeEdi210(
  raw: EdiRawInvoice,
  ctx: MappingContext = baselineMappingContext()
): NormalizedInvoice {
  const scac = raw.scac.toUpperCase();

  // Split line items into base charge vs accessorials
  const baseItems   = raw.lineItems.filter((li) => BASE_CHARGE_CODES.has(li.code.toUpperCase()));
  const accessItems = raw.lineItems.filter((li) => !BASE_CHARGE_CODES.has(li.code.toUpperCase()));

  const baseFuel = baseItems.reduce((sum, li) => sum + li.amount, 0);

  const accessorialFees = accessItems.map((li) => ({
    code:        ctx.accessorial(scac, li.code),
    description: li.description || li.code,
    amount:      li.amount,
  }));

  // Weight comes from first L0 line item that has weight
  const weightItem = raw.lineItems.find((li) => li.weight != null);
  const billedWeight = weightItem?.weight ?? 0;

  // Detect if dim weight was charged (DIM code present)
  const hasDim = accessorialFees.some((a) => a.code === 'DIM_WEIGHT');

  return {
    invoiceNumber:    raw.invoiceNumber,
    carrierScac:      scac,
    proNumber:        raw.proNumber || undefined,
    trackingNumber:   raw.proNumber || undefined,
    invoiceDate:      ediDateToIso(raw.invoiceDate),
    paymentDueDate:   undefined,
    baseFuel,
    accessorialFees,
    totalBilled:      raw.totalCharges,
    billedWeight,
    billedWeightType: hasDim ? 'dimensional' : 'actual',
    serviceLevel:     ctx.serviceLevel(scac, ''),  // EDI 210 doesn't always include service code
    originZip:        raw.originZip,
    destinationZip:   raw.destinationZip,
    addressType:      'unknown',
    shipDate:         raw.shipDate ? ediDateToIso(raw.shipDate) : undefined,
    rawSource:        'edi',
    rawPayload:       raw as unknown as Record<string, unknown>,
  };
}
