/*
  lib/ingestion/3pl/parse.ts — flexible parsers for 3PL invoice files.

  3PL files arrive as consolidated CSV/Excel and every 3PL formats differently,
  so headers are matched case-insensitively against synonym lists. Anything we
  don't recognize is preserved in `raw` (JSONB) so a format change surfaces as a
  reviewable row, not a crash.

  Two sections:
    - Fulfillment & shipping lines (keyed by Order ID / tracking)
    - Monthly storage ledger (keyed by SKU)
*/

// ── shared CSV helpers ───────────────────────────────────────
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function num(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = parseFloat(v.replace(/[$,]/g, ''));
  return isNaN(n) ? null : n;
}
function int(v: string | undefined): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

function buildIndex(headers: string[], synonyms: Record<string, string[]>): Record<string, number> {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    const norm = h.trim().toLowerCase();
    for (const [canon, names] of Object.entries(synonyms)) {
      if (idx[canon] === undefined && names.includes(norm)) idx[canon] = i;
    }
  });
  return idx;
}

// ── Fulfillment & shipping ───────────────────────────────────
const FULFILLMENT_SYNONYMS: Record<string, string[]> = {
  orderId:          ['order id', 'order #', 'order number', 'reference id', 'reference', 'shopify order id', 'order'],
  wmsShipmentId:    ['wms shipment id', 'wms id', 'shipment id', 'wms order id'],
  trackingNumber:   ['tracking number', 'tracking', 'tracking #', 'tracking no'],
  unitsPicked:      ['total units picked', 'units picked', 'units', 'qty picked', 'quantity'],
  basePickFee:      ['base pick fee', 'pick fee', 'base pick', 'fulfillment fee'],
  additionalPickFee:['additional pick fee', 'additional pick', 'extra pick fee', 'add l pick fee'],
  packagingFee:     ['packaging material fee', 'packaging fee', 'packaging', 'material fee'],
  billedDims:       ['billed dimensions', 'dimensions', 'dims', 'billed dims'],
  billedWeight:     ['billed weight', 'weight'],
  baseFreight:      ['base freight charge', 'base freight', 'freight charge', 'freight'],
  fuelSurcharge:    ['fuel surcharge', 'fuel', 'fsc'],
  totalBilled:      ['total billed freight', 'total billed', 'total', 'line total', 'amount'],
  carrierPro:       ['carrier pro', 'pro number', 'pro', 'carrier pro number', 'pro #'],
  baseCarrierCost:  ['base carrier cost', 'carrier cost', 'underlying cost', 'cost', 'net carrier cost'],
};

export type FulfillmentLine = {
  orderId: string | null;
  wmsShipmentId: string | null;
  trackingNumber: string | null;
  unitsPicked: number | null;
  basePickFee: number | null;
  additionalPickFee: number | null;
  packagingFee: number | null;
  billedDims: string | null;
  billedWeight: number | null;
  baseFreight: number | null;
  fuelSurcharge: number | null;
  totalBilled: number | null;
  carrierPro: string | null;
  baseCarrierCost: number | null;
  raw: Record<string, string>;
};

export function parseFulfillmentCsv(csv: string): { lines: FulfillmentLine[]; rowCount: number; skipped: number } {
  const rows = csv.split(/\r?\n/).filter((l) => l.trim());
  if (rows.length < 2) return { lines: [], rowCount: 0, skipped: 0 };
  const headers = splitCsvLine(rows[0]);
  const idx = buildIndex(headers, FULFILLMENT_SYNONYMS);
  const g = (r: string[], k: string) => (idx[k] !== undefined ? r[idx[k]] : undefined);

  const lines: FulfillmentLine[] = [];
  let skipped = 0;
  for (const line of rows.slice(1)) {
    const r = splitCsvLine(line);
    const orderId = g(r, 'orderId') || null;
    const tracking = g(r, 'trackingNumber') || null;
    if (!orderId && !tracking) { skipped++; continue; } // need an identifier
    lines.push({
      orderId,
      wmsShipmentId: g(r, 'wmsShipmentId') || null,
      trackingNumber: tracking,
      unitsPicked: int(g(r, 'unitsPicked')),
      basePickFee: num(g(r, 'basePickFee')),
      additionalPickFee: num(g(r, 'additionalPickFee')),
      packagingFee: num(g(r, 'packagingFee')),
      billedDims: g(r, 'billedDims') || null,
      billedWeight: num(g(r, 'billedWeight')),
      baseFreight: num(g(r, 'baseFreight')),
      fuelSurcharge: num(g(r, 'fuelSurcharge')),
      totalBilled: num(g(r, 'totalBilled')),
      carrierPro: g(r, 'carrierPro') || null,
      baseCarrierCost: num(g(r, 'baseCarrierCost')),
      raw: Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])),
    });
  }
  return { lines, rowCount: rows.length - 1, skipped };
}

// ── Storage ledger ───────────────────────────────────────────
const STORAGE_SYNONYMS: Record<string, string[]> = {
  sku:          ['sku', 'item number', 'item #', 'item', 'product sku'],
  storageType:  ['storage type', 'type', 'tier', 'storage tier'],
  qtyOnHand:    ['quantity on hand', 'qty on hand', 'qty', 'quantity', 'units'],
  cubicVolume:  ['total cubic volume', 'cubic volume', 'cubic feet', 'volume', 'cu ft'],
  locationId:   ['location id', 'location', 'facility', 'warehouse', 'node'],
  billedAmount: ['billed amount', 'storage fee', 'amount', 'total', 'charge'],
};

export type StorageLine = {
  sku: string | null;
  storageType: string | null;
  qtyOnHand: number | null;
  cubicVolume: number | null;
  locationId: string | null;
  billedAmount: number | null;
  raw: Record<string, string>;
};

export function parseStorageCsv(csv: string): { lines: StorageLine[]; rowCount: number; skipped: number } {
  const rows = csv.split(/\r?\n/).filter((l) => l.trim());
  if (rows.length < 2) return { lines: [], rowCount: 0, skipped: 0 };
  const headers = splitCsvLine(rows[0]);
  const idx = buildIndex(headers, STORAGE_SYNONYMS);
  const g = (r: string[], k: string) => (idx[k] !== undefined ? r[idx[k]] : undefined);

  const lines: StorageLine[] = [];
  let skipped = 0;
  for (const line of rows.slice(1)) {
    const r = splitCsvLine(line);
    const sku = g(r, 'sku') || null;
    if (!sku) { skipped++; continue; }
    lines.push({
      sku,
      storageType: g(r, 'storageType') || null,
      qtyOnHand: int(g(r, 'qtyOnHand')),
      cubicVolume: num(g(r, 'cubicVolume')),
      locationId: g(r, 'locationId') || null,
      billedAmount: num(g(r, 'billedAmount')),
      raw: Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])),
    });
  }
  return { lines, rowCount: rows.length - 1, skipped };
}
