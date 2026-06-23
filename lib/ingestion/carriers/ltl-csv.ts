/*
  lib/ingestion/carriers/ltl-csv.ts

  Parser for LTL carrier CSV / flat-file invoices dropped via SFTP.

  Most legacy LTL carriers (ODFL, SAIA, ESTES, XPO, Estes) drop a daily
  CSV with one row per invoice line item. Column names vary — this handles
  the most common layout and lets you override column mapping per carrier.

  Usage:
    const invoices = parseLtlCsv(csvString, { scac: 'ODFL' });
*/

import type { NormalizedInvoice, AccessorialFee } from '../schema';
import { type MappingContext, baselineMappingContext } from '../mappings';

export type LtlCsvColumnMap = {
  invoiceNumber:  string;
  proNumber:      string;
  invoiceDate:    string;
  shipDate?:      string;
  deliveredDate?: string;
  originZip:      string;
  destinationZip: string;
  serviceCode?:   string;
  chargeCode:     string;
  chargeDesc:     string;
  chargeAmount:   string;
  weight?:        string;
};

// Default column map — matches the most common LTL carrier CSV format
const DEFAULT_COLUMNS: LtlCsvColumnMap = {
  invoiceNumber:  'Invoice Number',
  proNumber:      'PRO Number',
  invoiceDate:    'Invoice Date',
  shipDate:       'Ship Date',
  deliveredDate:  'Delivery Date',
  originZip:      'Origin Zip',
  destinationZip: 'Destination Zip',
  serviceCode:    'Service Code',
  chargeCode:     'Charge Code',
  chargeDesc:     'Charge Description',
  chargeAmount:   'Charge Amount',
  weight:         'Billed Weight',
};

function parseRows(csv: string): Record<string, string>[] {
  const lines = csv.split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

export function parseLtlCsv(
  csv: string,
  options: { scac: string; columns?: Partial<LtlCsvColumnMap> },
  ctx: MappingContext = baselineMappingContext()
): NormalizedInvoice[] {
  const cols: LtlCsvColumnMap = { ...DEFAULT_COLUMNS, ...options.columns };
  const scac = options.scac.toUpperCase();
  const rows = parseRows(csv);

  // Group rows by invoice number — each invoice can have multiple charge rows
  const grouped = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const inv = row[cols.invoiceNumber] ?? '';
    if (!inv) continue;
    if (!grouped.has(inv)) grouped.set(inv, []);
    grouped.get(inv)!.push(row);
  }

  const results: NormalizedInvoice[] = [];

  for (const [invoiceNumber, invoiceRows] of grouped) {
    const first = invoiceRows[0];

    const accessorialFees: AccessorialFee[] = [];
    let baseFuel = 0;
    let billedWeight = 0;
    let totalBilled = 0;

    const BASE_CODES = new Set(['FR', 'LH', 'FREIGHT', 'BASE', 'LINE HAUL', 'LINEHAUL']);

    for (const row of invoiceRows) {
      const code   = row[cols.chargeCode] ?? '';
      const desc   = row[cols.chargeDesc] ?? '';
      const amount = parseFloat(row[cols.chargeAmount] ?? '0') || 0;
      const weight = cols.weight ? parseFloat(row[cols.weight] ?? '0') || 0 : 0;

      totalBilled += amount;
      if (weight > billedWeight) billedWeight = weight;

      if (BASE_CODES.has(code.toUpperCase())) {
        baseFuel += amount;
      } else {
        accessorialFees.push({
          code:        ctx.accessorial(scac, code),
          description: desc || code,
          amount,
        });
      }
    }

    const svcCode = cols.serviceCode ? (first[cols.serviceCode] ?? '') : '';

    results.push({
      invoiceNumber,
      carrierScac:      scac,
      proNumber:        first[cols.proNumber] ?? undefined,
      invoiceDate:      first[cols.invoiceDate] ?? '',
      shipDate:         cols.shipDate     ? first[cols.shipDate]     : undefined,
      deliveredDate:    cols.deliveredDate ? first[cols.deliveredDate]: undefined,
      baseFuel,
      accessorialFees,
      totalBilled,
      billedWeight,
      billedWeightType: 'actual',
      serviceLevel:     ctx.serviceLevel(scac, svcCode),
      originZip:        (first[cols.originZip] ?? '').substring(0, 5),
      destinationZip:   (first[cols.destinationZip] ?? '').substring(0, 5),
      addressType:      'unknown',
      rawSource:        'csv',
      rawPayload:       { rows: invoiceRows } as unknown as Record<string, unknown>,
    });
  }

  return results;
}
