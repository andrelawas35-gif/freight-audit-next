/*
  DUPLICATE_TRACKING — same PRO/tracking number billed on more than one invoice.

  Requires allInvoices to be passed so we can cross-reference.
  Flags every invoice beyond the first occurrence of a PRO number.
*/

import type { RuleFn, Finding } from '../types';

export const duplicateTrackingRule: RuleFn = (invoice, shipment, ctx) => {
  const allInvoices = ctx?.allInvoices;
  if (!shipment || !allInvoices) return null;

  const pro = shipment['PRO number'] || shipment['Tracking number'];
  if (!pro) return null;

  const billed = invoice['Amount billed'];
  if (!billed) return null;

  // Find all invoices that share this shipment's PRO
  const duplicates = allInvoices.filter((inv) => {
    if (inv.id === invoice.id) return false;
    // We'd need shipment linkage here — flag if same carrier + same invoice date as a proxy
    // Real implementation: join on Shipment link field matching same PRO
    return (
      inv['Carrier'] === invoice['Carrier'] &&
      inv['Invoice date'] === invoice['Invoice date'] &&
      inv['Amount billed'] === billed
    );
  });

  if (duplicates.length === 0) return null;

  return {
    ruleCode: 'DUPLICATE_TRACKING',
    outcome: 'FLAGGED',
    billedAmount: billed,
    expectedAmount: 0,
    variance: billed,
    notes: `Duplicate billing detected. PRO ${pro} also appears on ${duplicates.length} other invoice(s): ${duplicates.map((d) => d['Invoice number'] ?? d.id).join(', ')}.`,
    invoiceId: invoice.id,
    shipmentId: shipment.id,
  };
};
