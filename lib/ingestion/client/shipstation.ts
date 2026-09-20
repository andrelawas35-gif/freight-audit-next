/*
  lib/ingestion/client/shipstation.ts

  Adapter for ShipStation webhook payload (shipment_shipped event).
  ShipStation sends this when a label is created — it contains the
  actual dimensions and weight from the client's warehouse scale/WMS.

  Webhook setup: ShipStation → Settings → Integrations → Webhooks
  Event: "Item Shipped" → POST to /api/ingest/wms
*/

import type { NormalizedShipment } from '../schema';
import { standardizeServiceLevel } from '../service-level-map';

// Subset of ShipStation's shipment object
export type ShipStationWebhook = {
  resource_url: string;
  resource_type: 'SHIP_NOTIFY';
  shipments?: ShipStationShipment[];
};

export type ShipStationShipment = {
  shipmentId: number;
  orderId: number;
  orderNumber: string;
  trackingNumber: string;
  carrierCode: string;           // e.g. "fedex", "ups", "stamps_com"
  serviceCode: string;           // e.g. "fedex_ground"
  shipDate: string;              // ISO 8601
  weight: { value: number; units: 'pounds' | 'ounces' | 'grams' };
  dimensions?: { length: number; width: number; height: number; units: 'inches' | 'centimeters' };
  shipFrom: { postalCode: string };
  shipTo: { postalCode: string; residential?: boolean };
  customerId?: number;
  customerEmail?: string;
  // ShipStation doesn't include clientId — you'll need to map by customerEmail or customerId
};

const CARRIER_TO_SCAC: Record<string, string> = {
  fedex:       'FDXG',
  fedex_air:   'FDXE',
  ups:         'UPSN',
  usps:        'USPS',
  stamps_com:  'USPS',
  ontrac:      'OCA',
  dhl:         'DHLW',
};

function toWeightLbs(weight: ShipStationShipment['weight']): number {
  if (weight.units === 'pounds') return weight.value;
  if (weight.units === 'ounces') return weight.value / 16;
  if (weight.units === 'grams') return weight.value / 453.592;
  return weight.value;
}

function toDimInches(dim: NonNullable<ShipStationShipment['dimensions']>) {
  if (dim.units === 'inches') return dim;
  // centimeters → inches
  return {
    length: dim.length / 2.54,
    width:  dim.width  / 2.54,
    height: dim.height / 2.54,
  };
}

export function normalizeFromShipStation(
  shipment: ShipStationShipment,
  clientId: string   // you must resolve clientId externally by customer email / ID
): NormalizedShipment {
  const scac = CARRIER_TO_SCAC[shipment.carrierCode.toLowerCase()] ?? shipment.carrierCode.toUpperCase();
  const dims = shipment.dimensions ? toDimInches(shipment.dimensions) : null;

  return {
    trackingNumber:       shipment.trackingNumber,
    referenceNumber:      shipment.orderNumber,
    carrierScac:          scac,
    clientId,
    actualWeightLbs:      toWeightLbs(shipment.weight),
    actualL:              dims?.length ?? 0,
    actualW:              dims?.width  ?? 0,
    actualH:              dims?.height ?? 0,
    originZip:            shipment.shipFrom.postalCode.substring(0, 5),
    destinationZip:       shipment.shipTo.postalCode.substring(0, 5),
    addressType:          shipment.shipTo.residential ? 'residential' : 'commercial',
    serviceLevel:         standardizeServiceLevel(scac, shipment.serviceCode),
    shipDate:             shipment.shipDate,
    source:               'shipstation',
    rawPayload:           shipment as unknown as Record<string, unknown>,
  };
}
