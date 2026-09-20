/*
  lib/ingestion/client/generic-csv.ts

  Parses a client-uploaded shipment CSV (the "expected" / warehouse side) into
  NormalizedShipment[]. Used by the portal upload page.

  Column matching is case-insensitive and accepts common header synonyms, so
  clients don't have to match an exact template. Unknown columns are ignored.
*/

import type { NormalizedShipment } from '../schema';

// Map of canonical field → accepted header names (lowercased)
const SYNONYMS: Record<string, string[]> = {
  trackingNumber: ['tracking number', 'tracking', 'tracking #', 'tracking no', 'trackingnumber'],
  proNumber:      ['pro number', 'pro', 'pro #', 'pro no', 'pronumber'],
  referenceNumber:['reference', 'reference number', 'order number', 'order #', 'po', 'po number', 'ref'],
  carrierScac:    ['carrier', 'scac', 'carrier scac', 'carrier code'],
  actualWeightLbs:['weight', 'weight lbs', 'actual weight', 'actual weight lbs', 'lbs'],
  actualL:        ['length', 'l', 'length in', 'actual l'],
  actualW:        ['width', 'w', 'width in', 'actual w'],
  actualH:        ['height', 'h', 'height in', 'actual h'],
  originZip:      ['origin zip', 'from zip', 'ship from zip', 'origin'],
  destinationZip: ['destination zip', 'dest zip', 'to zip', 'ship to zip', 'destination'],
  addressType:    ['address type', 'address classification', 'residential', 'commercial'],
  serviceLevel:   ['service', 'service level', 'service type'],
  shipDate:       ['ship date', 'shipped', 'ship_date', 'date shipped'],
  requestedDeliveryDate: ['requested delivery date', 'requested delivery', 'expected delivery', 'due date'],
};

function buildHeaderIndex(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    const norm = h.trim().toLowerCase();
    for (const [canonical, names] of Object.entries(SYNONYMS)) {
      if (names.includes(norm) && idx[canonical] === undefined) {
        idx[canonical] = i;
      }
    }
  });
  return idx;
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV: handles quoted fields with commas.
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

function classifyAddress(v: string | undefined): 'commercial' | 'residential' | 'unknown' {
  const s = (v || '').toLowerCase();
  if (s.startsWith('res') || s === 'true' || s === 'y' || s === 'yes') return 'residential';
  if (s.startsWith('com') || s === 'false' || s === 'n' || s === 'no') return 'commercial';
  return 'unknown';
}

export type GenericCsvResult = {
  shipments: NormalizedShipment[];
  rowCount: number;
  skipped: number;
  /** % of staged shipments that have usable dimensions AND weight (0-100). */
  dataHealth: number;
};

export function parseClientShipmentCsv(
  csv: string,
  clientId: string
): GenericCsvResult {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { shipments: [], rowCount: 0, skipped: 0, dataHealth: 0 };

  const headers = splitCsvLine(lines[0]);
  const idx = buildHeaderIndex(headers);
  const get = (row: string[], key: string) =>
    idx[key] !== undefined ? row[idx[key]] : undefined;

  const shipments: NormalizedShipment[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const row = splitCsvLine(line);
    const tracking = get(row, 'trackingNumber');
    const pro = get(row, 'proNumber');

    // Must have at least one identifier to match against carrier invoices
    if (!tracking && !pro) { skipped++; continue; }

    shipments.push({
      trackingNumber: tracking || undefined,
      proNumber: pro || undefined,
      referenceNumber: get(row, 'referenceNumber') || undefined,
      carrierScac: (get(row, 'carrierScac') || 'UNKN').toUpperCase(),
      clientId,
      actualWeightLbs: num(get(row, 'actualWeightLbs')),
      actualL: num(get(row, 'actualL')),
      actualW: num(get(row, 'actualW')),
      actualH: num(get(row, 'actualH')),
      originZip: (get(row, 'originZip') || '').substring(0, 5),
      destinationZip: (get(row, 'destinationZip') || '').substring(0, 5),
      addressType: classifyAddress(get(row, 'addressType')),
      serviceLevel: get(row, 'serviceLevel') || '',
      shipDate: get(row, 'shipDate') || '',
      requestedDeliveryDate: get(row, 'requestedDeliveryDate') || undefined,
      source: 'wms_csv',
      rawPayload: Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])),
    });
  }

  const withUsableData = shipments.filter(
    (s) => s.actualL > 0 && s.actualW > 0 && s.actualH > 0 && s.actualWeightLbs > 0
  ).length;
  const dataHealth =
    shipments.length > 0 ? Math.round((withUsableData / shipments.length) * 100) : 0;

  return { shipments, rowCount: lines.length - 1, skipped, dataHealth };
}
