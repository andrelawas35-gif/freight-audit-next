/*
  POST /api/ingest/wms

  Receives client shipment data from ShipStation or Shopify webhooks.
  This is the "expected" side of the audit — actual dimensions from the warehouse.

  Body:
    { source: 'shipstation' | 'shopify', clientId: string, payload: <source-specific shape> }

  ShipStation webhook: configure to POST to this URL on "Item Shipped" event.
  Shopify webhook: configure to POST to this URL on "fulfillments/create" event.
*/

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeFromShipStation } from '@/lib/ingestion/client/shipstation';
import { normalizeFromShopify }     from '@/lib/ingestion/client/shopify';
import { stageClientShipment }      from '@/lib/ingestion/normalize';
import { withObservability }        from '@/lib/api-handler';

const bodySchema = z.object({
  source: z.enum(['shipstation', 'shopify']),
  clientId: z.string().min(1, 'clientId is required'),
  payload: z.record(z.string(), z.unknown()),
});

export const POST = withObservability('ingest/wms', async (req, { log }) => {
  const secret = req.headers.get('x-ingest-secret');
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    log.warn('invalid WMS body', { details: parsed.error.flatten() });
    return NextResponse.json(
      { ok: false, error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { source, clientId, payload } = parsed.data;

  const normalized = source === 'shipstation'
    ? normalizeFromShipStation(payload as any, clientId)
    : normalizeFromShopify(payload as any, clientId);

  const shipmentId = await stageClientShipment(normalized);
  log.info('shipment staged', { shipmentId, source, clientId });
  return NextResponse.json({ ok: true, shipmentId });
});
