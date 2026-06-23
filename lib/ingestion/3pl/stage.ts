/*
  lib/ingestion/3pl/stage.ts — stage parsed 3PL lines + three-way match.

  Fulfillment lines are matched to the client's source-of-truth shipments
  (already ingested from Shopify/ShipStation) by tracking number. Matched lines
  are auditable; unmatched lines are flagged for review (the 3PL claims a charge
  for an order we have no record of — itself a red flag).

  Storage lines are staged as-is (audited against contract rates in a later phase).
*/

import { getSql } from '@/lib/db';
import { fetchRecords } from '@/lib/airtable';
import type { FulfillmentLine, StorageLine } from './parse';

export type StageFulfillmentResult = { staged: number; matched: number; unmatched: number };

export async function stageFulfillment(input: {
  clientId: string;
  carrierScac: string | null;
  cycle: string;
  lines: FulfillmentLine[];
}): Promise<StageFulfillmentResult> {
  const sql = getSql();

  // Build a tracking → shipmentId index from the client's source-of-truth shipments.
  const shipments = (await fetchRecords('Shipments', {
    maxRecords: 1000,
    fields: ['Tracking number'],
  })) as { id: string; 'Tracking number'?: string }[];
  const byTracking = new Map<string, string>();
  for (const s of shipments) {
    const t = s['Tracking number'];
    if (t) byTracking.set(t.toUpperCase(), s.id);
  }

  let matched = 0;
  let unmatched = 0;

  await sql.query('BEGIN');
  try {
    for (const l of input.lines) {
      const shipmentId = l.trackingNumber ? byTracking.get(l.trackingNumber.toUpperCase()) ?? null : null;
      const status = shipmentId ? 'matched' : 'unmatched';
      if (shipmentId) matched++; else unmatched++;

      await sql.query(
        `INSERT INTO tpl_fulfillment_lines
           (client_id, carrier_scac, invoice_cycle, order_id, wms_shipment_id, tracking_number,
            units_picked, base_pick_fee, additional_pick_fee, packaging_fee, billed_dims, billed_weight,
            base_freight, fuel_surcharge, total_billed, carrier_pro, base_carrier_cost,
            match_status, matched_shipment_id, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          input.clientId, input.carrierScac, input.cycle, l.orderId, l.wmsShipmentId, l.trackingNumber,
          l.unitsPicked, l.basePickFee, l.additionalPickFee, l.packagingFee, l.billedDims, l.billedWeight,
          l.baseFreight, l.fuelSurcharge, l.totalBilled, l.carrierPro, l.baseCarrierCost,
          status, shipmentId, JSON.stringify(l.raw),
        ]
      );
    }
    await sql.query('COMMIT');
  } catch (err) {
    await sql.query('ROLLBACK');
    throw err;
  }
  return { staged: input.lines.length, matched, unmatched };
}

export async function stageStorage(input: {
  clientId: string;
  cycle: string;
  lines: StorageLine[];
}): Promise<{ staged: number }> {
  const sql = getSql();
  await sql.query('BEGIN');
  try {
    for (const l of input.lines) {
      await sql.query(
        `INSERT INTO tpl_storage_lines
           (client_id, invoice_cycle, sku, storage_type, qty_on_hand, cubic_volume, location_id, billed_amount, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [input.clientId, input.cycle, l.sku, l.storageType, l.qtyOnHand, l.cubicVolume, l.locationId, l.billedAmount, JSON.stringify(l.raw)]
      );
    }
    await sql.query('COMMIT');
  } catch (err) {
    await sql.query('ROLLBACK');
    throw err;
  }
  return { staged: input.lines.length };
}

// ── console read models ──────────────────────────────────────
export type FulfillmentRow = {
  id: string; client_id: string | null; carrier_scac: string | null; invoice_cycle: string | null;
  order_id: string | null; tracking_number: string | null; units_picked: number | null;
  base_pick_fee: number | null; total_billed: number | null; match_status: string; created_at: string;
};

export async function listFulfillmentLines(limit = 100): Promise<FulfillmentRow[]> {
  const sql = getSql();
  return (await sql.query(
    `SELECT id, client_id, carrier_scac, invoice_cycle, order_id, tracking_number,
            units_picked, base_pick_fee, total_billed, match_status, created_at
       FROM tpl_fulfillment_lines ORDER BY created_at DESC LIMIT $1`,
    [limit]
  )) as FulfillmentRow[];
}

export type CycleSummary = {
  client_id: string | null; invoice_cycle: string | null;
  lines: number; matched: number; unmatched: number; billed: number;
};

export async function getCycleSummaries(limit = 50): Promise<CycleSummary[]> {
  const sql = getSql();
  return (await sql.query(
    `SELECT client_id, invoice_cycle,
            count(*)::int AS lines,
            count(*) FILTER (WHERE match_status='matched')::int AS matched,
            count(*) FILTER (WHERE match_status='unmatched')::int AS unmatched,
            coalesce(sum(total_billed),0) AS billed
       FROM tpl_fulfillment_lines
       GROUP BY client_id, invoice_cycle
       ORDER BY max(created_at) DESC
       LIMIT $1`,
    [limit]
  )) as CycleSummary[];
}
