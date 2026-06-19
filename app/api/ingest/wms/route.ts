/*
  POST /api/ingest/wms

  Receives client shipment data from ShipStation or Shopify webhooks.
  This is the "expected" side of the audit — actual dimensions from the warehouse.

  Body:
    { source: 'shipstation' | 'shopify', clientId: string, payload: <source-specific shape> }

  ShipStation webhook: configure to POST to this URL on "Item Shipped" event.
  Shopify webhook: configure to POST to this URL on "fulfillments/create" event.
*/

import { NextRequest, NextResponse } from 'next/server';
import { normalizeFromShipStation } from '@/lib/ingestion/client/shipstation';
import { normalizeFromShopify }     from '@/lib/ingestion/client/shopify';
import { stageClientShipment }      from '@/lib/ingestion/normalize';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-ingest-secret');
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { source, clientId, payload } = body as {
      source: 'shipstation' | 'shopify';
      clientId: string;
      payload: unknown;
    };

    if (!clientId) {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }

    let normalized;
    if (source === 'shipstation') {
      normalized = normalizeFromShipStation(payload as any, clientId);
    } else if (source === 'shopify') {
      normalized = normalizeFromShopify(payload as any, clientId);
    } else {
      return NextResponse.json({ error: `Unknown source: ${source}` }, { status: 400 });
    }

    const shipmentId = await stageClientShipment(normalized);
    return NextResponse.json({ ok: true, shipmentId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ingest/wms]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
