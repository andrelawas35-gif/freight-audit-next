/*
  lib/ingestion/carriers/fedex-api.ts

  Adapter for FedEx REST API invoice payload.
  FedEx API docs: https://developer.fedex.com/api/en-us/catalog/invoices.html

  The raw shape below reflects the FedEx Invoice & Billing API response.
  Call normalizeFromFedexApi() after fetching with your FedEx credentials.
*/

import type { NormalizedInvoice, AccessorialFee } from '../schema';
import { standardizeAccessorial } from '../accessorial-map';
import { standardizeServiceLevel } from '../service-level-map';

// Subset of what FedEx actually returns — extend as needed
export type FedExApiInvoice = {
  invoiceNumber: string;
  invoiceDate: string;                  // ISO 8601
  dueDate?: string;
  trackingNumber: string;
  serviceType: string;                  // e.g. "FEDEX_GROUND"
  shipDate: string;
  deliveryDate?: string;
  originZip: string;
  destinationZip: string;
  recipientAddressType?: 'RESIDENTIAL' | 'BUSINESS';
  chargedWeight: number;
  chargedWeightType: 'ACTUAL' | 'DIM';
  dimensions?: { length: number; width: number; height: number };
  baseCharge: number;
  fuelSurcharge: number;
  surcharges: Array<{ type: string; amount: number; description: string }>;
  totalNetCharge: number;
};

export function normalizeFromFedexApi(raw: FedExApiInvoice): NormalizedInvoice {
  const scac = raw.serviceType.startsWith('FEDEX_GROUND') ? 'FDXG' : 'FDXE';

  const accessorialFees: AccessorialFee[] = [
    { code: 'FUEL_SURCHARGE', description: 'Fuel Surcharge', amount: raw.fuelSurcharge },
    ...raw.surcharges.map((s) => ({
      code:        standardizeAccessorial(scac, s.type),
      description: s.description || s.type,
      amount:      s.amount,
    })),
  ].filter((f) => f.amount > 0);

  return {
    invoiceNumber:    raw.invoiceNumber,
    carrierScac:      scac,
    trackingNumber:   raw.trackingNumber,
    invoiceDate:      raw.invoiceDate,
    paymentDueDate:   raw.dueDate,
    baseFuel:         raw.baseCharge + raw.fuelSurcharge,
    accessorialFees,
    totalBilled:      raw.totalNetCharge,
    billedWeight:     raw.chargedWeight,
    billedWeightType: raw.chargedWeightType === 'DIM' ? 'dimensional' : 'actual',
    dimL:             raw.dimensions?.length,
    dimW:             raw.dimensions?.width,
    dimH:             raw.dimensions?.height,
    serviceLevel:     standardizeServiceLevel(scac, raw.serviceType),
    originZip:        raw.originZip,
    destinationZip:   raw.destinationZip,
    addressType:      raw.recipientAddressType === 'RESIDENTIAL' ? 'residential'
                    : raw.recipientAddressType === 'BUSINESS'     ? 'commercial'
                    : 'unknown',
    shipDate:         raw.shipDate,
    deliveredDate:    raw.deliveryDate,
    rawSource:        'api',
    rawPayload:       raw as unknown as Record<string, unknown>,
  };
}
