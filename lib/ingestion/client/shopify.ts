/*
  lib/ingestion/client/shopify.ts

  Adapter for Shopify fulfillment webhook (fulfillments/create).
  Shopify sends this when an order is fulfilled with a tracking number.

  Webhook setup: Shopify Admin → Settings → Notifications → Webhooks
  Event: "Fulfillment creation" → POST to /api/ingest/wms

  NOTE: Shopify fulfillment webhooks do NOT include box weight/dimensions —
  those live in the product variant. This adapter fetches variant data
  from the payload. For accurate warehouse dimensions, prefer ShipStation
  or a WMS that measures at pack time.
*/

import type { NormalizedShipment } from '../schema';
import { standardizeServiceLevel } from '../service-level-map';

export type ShopifyFulfillment = {
  id: number;
  order_id: number;
  name: string;                     // e.g. "#1001.1"
  tracking_number: string | null;
  tracking_company: string | null;  // e.g. "FedEx"
  service: string | null;           // e.g. "ground"
  shipment_status: string | null;
  created_at: string;               // ISO 8601
  line_items: ShopifyLineItem[];
  destination?: {
    zip: string;
    country_code: string;
  };
  origin_address?: {
    zip: string;
  };
};

export type ShopifyLineItem = {
  variant_id: number;
  quantity: number;
  grams: number;                   // weight per unit
  requires_shipping: boolean;
};

const COMPANY_TO_SCAC: Record<string, string> = {
  'FedEx':      'FDXG',
  'UPS':        'UPSN',
  'USPS':       'USPS',
  'DHL':        'DHLW',
  'OnTrac':     'OCA',
  'Canada Post':'CDNX',
};

export function normalizeFromShopify(
  fulfillment: ShopifyFulfillment,
  clientId: string
): NormalizedShipment {
  const scac = COMPANY_TO_SCAC[fulfillment.tracking_company ?? ''] ?? 'UNKN';

  // Sum total weight from line items (grams → lbs)
  const totalGrams = fulfillment.line_items.reduce(
    (sum, li) => sum + li.grams * li.quantity,
    0
  );
  const weightLbs = totalGrams / 453.592;

  return {
    trackingNumber:  fulfillment.tracking_number ?? undefined,
    referenceNumber: fulfillment.name,
    carrierScac:     scac,
    clientId,
    actualWeightLbs: parseFloat(weightLbs.toFixed(2)),
    actualL:         0,   // Shopify doesn't provide box dims at fulfillment time
    actualW:         0,
    actualH:         0,
    originZip:       fulfillment.origin_address?.zip?.substring(0, 5) ?? '',
    destinationZip:  fulfillment.destination?.zip?.substring(0, 5) ?? '',
    addressType:     'unknown',  // Shopify doesn't expose residential flag in webhook
    serviceLevel:    standardizeServiceLevel(scac, fulfillment.service ?? ''),
    shipDate:        fulfillment.created_at,
    source:          'shopify',
    rawPayload:      fulfillment as unknown as Record<string, unknown>,
  };
}
