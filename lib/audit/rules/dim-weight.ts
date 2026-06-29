/*
  DIM_WEIGHT_TRAP — carrier billed dimensional weight that exceeds actual weight.

  UPS/FedEx dim factor is 139 (in³ per lb). USPS uses 166.
  We default to 139 (parcel carriers). Pass a custom dimFactor if needed.

  Flags when: dim weight > actual weight AND billed amount > what actual weight would cost.
  Since we don't store per-lb rate, we approximate: scale billed amount by the weight ratio.
*/

import type { RuleFn, Finding } from '../types';
import { scopeOf } from '../types';

const DEFAULT_DIM_FACTOR = 139; // cubic inches per pound (global fallback)

export const dimWeightRule: RuleFn = (invoice, shipment, ctx) => {
  if (!shipment) return null;

  const { 'Actual L': l, 'Actual W': w, 'Actual H': h, 'Actual weight lbs': actualWeight } = shipment;
  const billed = invoice['Amount billed'];

  if (!l || !w || !h || !actualWeight || !billed) return null;

  // Dim divisor comes from the client's contract if negotiated, else the
  // carrier's published value, else the global default.
  const dimFactor = ctx.resolver.num('dim_divisor', scopeOf(invoice, shipment), DEFAULT_DIM_FACTOR);

  const dimWeight = Math.ceil((l * w * h) / dimFactor);
  const billableWeight = Math.max(dimWeight, actualWeight);

  // Only flag if carrier used dim weight (billable > actual)
  if (billableWeight <= actualWeight) return null;

  // Approximate expected charge: scale by actual/dim ratio
  const expectedAmount = parseFloat(((actualWeight / dimWeight) * billed).toFixed(2));
  const variance = parseFloat((billed - expectedAmount).toFixed(2));

  // Only flag if overcharge is material (> $1)
  if (variance < 1) return null;

  return {
    ruleCode: 'DIM_WEIGHT_TRAP',
    outcome: 'FLAGGED',
    billedAmount: billed,
    expectedAmount,
    variance,
    notes: `Dim weight ${dimWeight} lbs vs actual ${actualWeight} lbs (${l}"×${w}"×${h}"). Estimated overcharge $${variance.toFixed(2)}.`,
    invoiceId: invoice.id,
    shipmentId: shipment.id,
  };
};
