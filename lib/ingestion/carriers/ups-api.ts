/*
  lib/ingestion/carriers/ups-api.ts

  Adapter for UPS Billing Center API / Quantum View invoice data.
  UPS API docs: https://developer.ups.com/api/reference/invoices

  UPS delivers invoices weekly via their Billing Center.
  You can also pull via the Quantum View Data API for real-time tracking.
*/

import type { NormalizedInvoice, AccessorialFee } from '../schema';
import { standardizeAccessorial } from '../accessorial-map';
import { standardizeServiceLevel } from '../service-level-map';

export type UpsApiInvoice = {
  invoiceNumber: string;
  invoiceDate: string;                  // YYYYMMDD
  dueDate?: string;
  trackingNumber: string;
  serviceCode: string;                  // e.g. "03" = Ground
  shipDate: string;                     // YYYYMMDD
  deliveryDate?: string;
  senderZip: string;
  receiverZip: string;
  residentialIndicator?: '1' | '0';
  billedWeight: number;
  billedWeightType: 'BillableWeight' | 'DimensionalWeight' | 'ActualWeight';
  length?: number;
  width?: number;
  height?: number;
  transportationCharges: number;
  fuelSurcharge: number;
  accessorials: Array<{ code: string; description: string; amount: number }>;
  totalCharges: number;
};

function upsDateToIso(d: string): string {
  // YYYYMMDD → YYYY-MM-DD
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return d;
}

export function normalizeFromUpsApi(raw: UpsApiInvoice): NormalizedInvoice {
  const scac = 'UPSN';

  const accessorialFees: AccessorialFee[] = [
    { code: 'FUEL_SURCHARGE', description: 'Fuel Surcharge', amount: raw.fuelSurcharge },
    ...raw.accessorials.map((a) => ({
      code:        standardizeAccessorial(scac, a.code),
      description: a.description || a.code,
      amount:      a.amount,
    })),
  ].filter((f) => f.amount > 0);

  const isDim = raw.billedWeightType === 'DimensionalWeight';

  return {
    invoiceNumber:    raw.invoiceNumber,
    carrierScac:      scac,
    trackingNumber:   raw.trackingNumber,
    invoiceDate:      upsDateToIso(raw.invoiceDate),
    paymentDueDate:   raw.dueDate ? upsDateToIso(raw.dueDate) : undefined,
    baseFuel:         raw.transportationCharges + raw.fuelSurcharge,
    accessorialFees,
    totalBilled:      raw.totalCharges,
    billedWeight:     raw.billedWeight,
    billedWeightType: isDim ? 'dimensional' : 'actual',
    dimL:             raw.length,
    dimW:             raw.width,
    dimH:             raw.height,
    serviceLevel:     standardizeServiceLevel(scac, raw.serviceCode),
    originZip:        raw.senderZip.substring(0, 5),
    destinationZip:   raw.receiverZip.substring(0, 5),
    addressType:      raw.residentialIndicator === '1' ? 'residential'
                    : raw.residentialIndicator === '0' ? 'commercial'
                    : 'unknown',
    shipDate:         upsDateToIso(raw.shipDate),
    deliveredDate:    raw.deliveryDate ? upsDateToIso(raw.deliveryDate) : undefined,
    rawSource:        'api',
    rawPayload:       raw as unknown as Record<string, unknown>,
  };
}
