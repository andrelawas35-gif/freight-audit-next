/*
  DUPLICATE_TRACKING - same PRO/tracking number billed on more than one invoice.

  Duplicate proof must come from shipment links and actual linked shipment
  identifiers. Do not fall back to carrier/date/amount invoice heuristics.
*/

import type { Invoice, Shipment } from '@/lib/types';
import type { RuleFn } from '../types';

type ShipmentLookup =
  | Shipment[]
  | Map<string, Shipment>
  | Record<string, Shipment | undefined>
  | undefined;

type DuplicateTrackingContext = Parameters<RuleFn>[2] & {
  allShipments?: Shipment[];
  shipmentById?: ShipmentLookup;
  shipmentsById?: ShipmentLookup;
};

function normalizeIdentifier(value: string | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function shipmentIdentifiers(shipment: Shipment | null | undefined): Set<string> {
  const identifiers = new Set<string>();
  const pro = normalizeIdentifier(shipment?.['PRO number']);
  const tracking = normalizeIdentifier(shipment?.['Tracking number']);
  if (pro) identifiers.add(pro);
  if (tracking) identifiers.add(tracking);
  return identifiers;
}

function lookupShipment(source: ShipmentLookup, id: string): Shipment | undefined {
  if (!source) return undefined;
  if (Array.isArray(source)) return source.find((candidate) => candidate.id === id);
  if (source instanceof Map) return source.get(id);
  return source[id];
}

function getLinkedShipments(
  invoice: Invoice,
  currentShipment: Shipment,
  ctx: DuplicateTrackingContext
): Shipment[] {
  return (invoice['Shipment'] ?? [])
    .map((shipmentId) => {
      if (shipmentId === currentShipment.id) return currentShipment;
      return (
        lookupShipment(ctx.shipmentById, shipmentId) ??
        lookupShipment(ctx.shipmentsById, shipmentId) ??
        lookupShipment(ctx.allShipments, shipmentId)
      );
    })
    .filter((candidate): candidate is Shipment => Boolean(candidate));
}

function sharesAnyIdentifier(
  invoice: Invoice,
  currentShipment: Shipment,
  currentIdentifiers: Set<string>,
  ctx: DuplicateTrackingContext
): boolean {
  return getLinkedShipments(invoice, currentShipment, ctx).some((linkedShipment) => {
    const identifiers = shipmentIdentifiers(linkedShipment);
    return [...identifiers].some((identifier) => currentIdentifiers.has(identifier));
  });
}

export const duplicateTrackingRule: RuleFn = (invoice, shipment, ctx) => {
  const duplicateCtx = ctx as DuplicateTrackingContext | undefined;
  const allInvoices = duplicateCtx?.allInvoices;
  if (!shipment || !allInvoices) return null;

  const currentIdentifiers = shipmentIdentifiers(shipment);
  if (currentIdentifiers.size === 0) return null;

  const billed = invoice['Amount billed'];
  if (typeof billed !== 'number' || !Number.isFinite(billed) || billed <= 0) return null;

  const duplicates = allInvoices.filter((candidate) => {
    if (candidate.id === invoice.id) return false;
    return sharesAnyIdentifier(candidate, shipment, currentIdentifiers, duplicateCtx);
  });

  if (duplicates.length === 0) return null;

  const displayedIdentifier =
    normalizeIdentifier(shipment['PRO number']) ??
    normalizeIdentifier(shipment['Tracking number']) ??
    'unknown';

  return {
    ruleCode: 'DUPLICATE_TRACKING',
    outcome: 'FLAGGED',
    billedAmount: billed,
    expectedAmount: 0,
    variance: billed,
    notes: `Duplicate billing detected. PRO/tracking ${displayedIdentifier} also appears on ${duplicates.length} other invoice(s): ${duplicates.map((d) => d['Invoice number'] ?? d.id).join(', ')}.`,
    invoiceId: invoice.id,
    shipmentId: shipment.id,
  };
};
