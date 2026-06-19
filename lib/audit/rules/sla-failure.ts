/*
  SLA_FAILURE / LTL_SLA_FAILURE — delivery arrived after the guaranteed transit time.

  Transit time commitments by service level (business days, parcel):
    - Overnight / Next Day Air  → 1 day
    - 2-Day                     → 2 days
    - 3-Day / Ground Advantage  → 3 days
    - Ground                    → varies by zone (we default 5 as conservative)

  LTL guarantees vary per carrier; we use 1 business day late as the threshold.

  If late: full shipping charge is refundable under money-back guarantee.
*/

import type { RuleFn, Finding } from '../types';

const SLA_DAYS: Record<string, number> = {
  'Next Day Air': 1,
  'Overnight': 1,
  '2-Day': 2,
  '2Day': 2,
  '3-Day': 3,
  'Ground Advantage': 3,
  'Ground': 5,
  'LTL Guaranteed': 1,
  'Guaranteed': 1,
};

function businessDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

function isLTL(serviceLevel: string) {
  return serviceLevel.toUpperCase().includes('LTL');
}

export const slaFailureRule: RuleFn = (invoice, shipment) => {
  if (!shipment) return null;

  const svc = shipment['Service level'];
  const shipDate = shipment['Ship date'];
  const deliveryDate = shipment['Delivery date'];
  const billed = invoice['Amount billed'];

  if (!svc || !shipDate || !deliveryDate || !billed) return null;

  const promised = SLA_DAYS[svc];
  if (!promised) return null; // unknown service level, skip

  const shipped = new Date(shipDate);
  const delivered = new Date(deliveryDate);
  const actualDays = businessDaysBetween(shipped, delivered);
  const daysLate = actualDays - promised;

  if (daysLate <= 0) return null;

  const ruleCode = isLTL(svc) ? 'LTL_SLA_FAILURE' : 'SLA_FAILURE';

  return {
    ruleCode,
    outcome: 'FLAGGED',
    billedAmount: billed,
    expectedAmount: 0,
    variance: billed,
    notes: `${svc} service: promised ${promised} business day(s), delivered in ${actualDays} (${daysLate} day(s) late). Full refund eligible.`,
    invoiceId: invoice.id,
    shipmentId: shipment.id,
  };
};
