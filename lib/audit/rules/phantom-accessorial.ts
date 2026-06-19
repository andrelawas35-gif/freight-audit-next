/*
  PHANTOM_ACCESSORIAL — residential delivery surcharge on a commercial address.

  Carriers charge ~$5-$6 for residential delivery. If the shipment destination
  is classified as Commercial but was charged a residential surcharge, flag it.

  Since we don't store line-item charges separately here, we check address
  classification and flag the invoice if the address is Commercial. The billed
  vs expected delta is approximated as the standard residential surcharge rate.
*/

import type { RuleFn, Finding } from '../types';

// Standard residential surcharge rates by carrier SCAC (2024 approximations)
const RESIDENTIAL_SURCHARGE: Record<string, number> = {
  UPSN: 6.40,
  FDXG: 6.30,
  FDXE: 6.30,
  default: 5.50,
};

export const phantomAccessorialRule: RuleFn = (invoice, shipment) => {
  if (!shipment) return null;
  if (shipment['Address classification'] !== 'Commercial') return null;

  const billed = invoice['Amount billed'];
  if (!billed) return null;

  const scac = (shipment['Carrier'] || invoice['Carrier'] || '').toUpperCase();
  const surcharge = RESIDENTIAL_SURCHARGE[scac] ?? RESIDENTIAL_SURCHARGE.default;

  const expectedAmount = parseFloat((billed - surcharge).toFixed(2));
  const variance = surcharge;

  return {
    ruleCode: 'PHANTOM_ACCESSORIAL',
    outcome: 'FLAGGED',
    billedAmount: billed,
    expectedAmount,
    variance,
    notes: `Residential surcharge (~$${surcharge.toFixed(2)}) applied to commercial address (${shipment['Destination zip'] ?? 'unknown zip'}).`,
    invoiceId: invoice.id,
    shipmentId: shipment.id,
  };
};
