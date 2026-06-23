/*
  PHANTOM_ACCESSORIAL — residential delivery surcharge that shouldn't apply.

  Two ways this is a valid dispute:
    1. The destination is a Commercial address (residential surcharge mis-applied).
    2. The client's contract waives the residential surcharge entirely
       (rulebook: residential_waived = true) — any residential charge is recoverable.

  The expected surcharge rate comes from the layered rulebook:
  client contract → carrier published rate → global default.
*/

import type { RuleFn, Finding } from '../types';
import { scopeOf } from '../types';

const DEFAULT_RESIDENTIAL = 5.50;

export const phantomAccessorialRule: RuleFn = (invoice, shipment, ctx) => {
  if (!shipment) return null;

  const billed = invoice['Amount billed'];
  if (!billed) return null;

  const scope = scopeOf(invoice, shipment);
  const isCommercial = shipment['Address classification'] === 'Commercial';
  const waived = ctx.resolver.bool('residential_waived', scope, false);

  // Only a dispute if the address is commercial OR the contract waives residential.
  if (!isCommercial && !waived) return null;

  const surcharge = ctx.resolver.num('residential_surcharge', scope, DEFAULT_RESIDENTIAL);
  const expectedAmount = parseFloat((billed - surcharge).toFixed(2));

  const reason = waived
    ? 'contract waives residential surcharge'
    : `commercial address (${shipment['Destination zip'] ?? 'unknown zip'})`;

  return {
    ruleCode: 'PHANTOM_ACCESSORIAL',
    outcome: 'FLAGGED',
    billedAmount: billed,
    expectedAmount,
    variance: surcharge,
    notes: `Residential surcharge (~$${surcharge.toFixed(2)}) — ${reason}.`,
    invoiceId: invoice.id,
    shipmentId: shipment.id,
  };
};
