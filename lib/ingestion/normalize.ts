/*
  lib/ingestion/normalize.ts

  Writes normalized invoices and shipments into Airtable (Invoices + Shipments tables).
  This is the bridge between ingestion and the audit engine.

  Call stageInvoice() / stageShipment() after normalizing raw carrier/client data.
  The audit engine (lib/audit/engine.ts) then reads from these tables.
*/

import { createRecord, fetchRecords, findByField, updateRecord } from '@/lib/db/records';
import type { NormalizedInvoice, NormalizedShipment } from './schema';
import { log } from '@/lib/logger';

// ── Invoice staging ──────────────────────────────────────────────

export async function stageInvoice(inv: NormalizedInvoice): Promise<string> {
  // Idempotency: skip if invoice number already exists
  const existing = await findByField('Invoices', 'Invoice number', inv.invoiceNumber, 1);
  if (existing.length > 0) {
    log.debug('invoice already staged, skipping', { invoiceNumber: inv.invoiceNumber, existingId: existing[0].id });
    return existing[0].id;
  }

  // Resolve carrier record ID from SCAC
  const carriers = await findByField('Carriers', 'SCAC', inv.carrierScac, 1);
  const carrierId = carriers[0]?.id;

  const record = await createRecord('Invoices', {
    'Invoice number':  inv.invoiceNumber,
    'Amount billed':   inv.totalBilled,
    'Invoice date':    inv.invoiceDate,
    'Payment due date':inv.paymentDueDate ?? null,
    'Carrier':         carrierId ? [carrierId] : undefined,
    // Store raw source in Notes until you add a Source field to the table
    'Status':          'Pending',
  });

  // Stage shipment linkage if we have tracking/PRO
  if (inv.proNumber || inv.trackingNumber) {
    await stageShipmentForInvoice(inv, record.id);
  }

  log.info('invoice staged', {
    invoiceId: record.id,
    invoiceNumber: inv.invoiceNumber,
    carrier: inv.carrierScac,
    amount: inv.totalBilled,
  });

  return record.id;
}

// ── Shipment staging (from carrier invoice) ──────────────────────

async function stageShipmentForInvoice(
  inv: NormalizedInvoice,
  invoiceId: string
): Promise<void> {
  const lookupField = inv.proNumber ? 'PRO number' : 'Tracking number';
  const lookupValue = inv.proNumber || inv.trackingNumber!;
  const existing = await findByField('Shipments', lookupField, lookupValue, 1);
  if (existing.length > 0) {
    // Link the existing shipment to this invoice
    await updateRecord('Invoices', invoiceId, { 'Shipment': [existing[0].id] });
    return;
  }

  const shipment = await createRecord('Shipments', {
    'PRO number':             inv.proNumber ?? null,
    'Tracking number':        inv.trackingNumber ?? null,
    'Ship date':              inv.shipDate ?? null,
    'Delivery date':          inv.deliveredDate ?? null,
    'Service level':          inv.serviceLevel,
    'Carrier':                inv.carrierScac,
    'Destination zip':        inv.destinationZip,
    'Address classification': inv.addressType === 'residential' ? 'Residential'
                            : inv.addressType === 'commercial'  ? 'Commercial'
                            : 'Unknown',
    // Dims from carrier (may be overwritten by WMS data later)
    'Actual L': inv.dimL ?? null,
    'Actual W': inv.dimW ?? null,
    'Actual H': inv.dimH ?? null,
    'Actual weight lbs': inv.billedWeight ?? null,
  });

  // Link shipment to invoice
  await updateRecord('Invoices', invoiceId, { 'Shipment': [shipment.id] });
}

// ── Shipment staging (from client WMS) ───────────────────────────

export async function stageClientShipment(s: NormalizedShipment): Promise<string> {
  // Try to find existing shipment by tracking number or PRO
  const lookupField2 = s.trackingNumber ? 'Tracking number' : s.proNumber ? 'PRO number' : null;
  const lookupValue2 = s.trackingNumber || s.proNumber || null;

  if (lookupField2 && lookupValue2) {
    const existing = await findByField('Shipments', lookupField2, lookupValue2, 1);

    if (existing.length > 0) {
      // Update with authoritative WMS dimensions (overwrite carrier-reported dims)
      await updateRecord('Shipments', existing[0].id, {
        'Actual L':              s.actualL,
        'Actual W':              s.actualW,
        'Actual H':              s.actualH,
        'Actual weight lbs':     s.actualWeightLbs,
        'Address classification':s.addressType === 'residential' ? 'Residential'
                                : s.addressType === 'commercial'  ? 'Commercial'
                                : 'Unknown',
      });
      return existing[0].id;
    }
  }

  log.info('new WMS shipment staging', { trackingNumber: s.trackingNumber, carrier: s.carrierScac });

  // Create new shipment record from WMS data
  const record = await createRecord('Shipments', {
    'Tracking number':        s.trackingNumber ?? null,
    'PRO number':             s.proNumber ?? null,
    'Ship date':              s.shipDate,
    'Service level':          s.serviceLevel,
    'Carrier':                s.carrierScac,
    'Destination zip':        s.destinationZip,
    'Address classification': s.addressType === 'residential' ? 'Residential'
                            : s.addressType === 'commercial'  ? 'Commercial'
                            : 'Unknown',
    'Actual L':               s.actualL,
    'Actual W':               s.actualW,
    'Actual H':               s.actualH,
    'Actual weight lbs':      s.actualWeightLbs,
  });

  return record.id;
}
