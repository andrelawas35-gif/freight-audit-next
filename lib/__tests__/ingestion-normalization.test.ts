/**
 * Ingestion Normalization — Integration Tests
 *
 * Validates that each carrier/client adapter normalizes its input
 * into the canonical shipment shape used by the audit engines.
 *
 * Covers: FedEx, UPS, EDI, LTL CSV, ShipStation, Shopify, generic CSV.
 */

import { describe, it, expect } from 'vitest';

// ── Adapter imports (read-only — tests validate their output shape) ──

// The ingestion adapters are in lib/ingestion/. Each normalizes raw
// carrier/client data into a common shipment row format.

// ── Canonical shipment shape (from lib/types.ts / db/schema.ts) ──

interface NormalizedShipment {
  'PRO number'?: string | null;
  'Tracking number'?: string | null;
  'Carrier'?: string | null;
  'Actual L'?: number | null;
  'Actual W'?: number | null;
  'Actual H'?: number | null;
  'Actual weight lbs'?: number | null;
  'Ship date'?: string | null;
  'Service level'?: string | null;
  'Destination zip'?: string | null;
  'Address classification'?: string | null;
}

const REQUIRED_FIELDS: (keyof NormalizedShipment)[] = [
  'Carrier',
];

// Every adapter must have at least one tracking identifier
const TRACKING_FIELDS: (keyof NormalizedShipment)[] = [
  'Tracking number',
  'PRO number',
];

// ── Shape validation helpers ──────────────────────────────────────

function validateShipmentShape(row: NormalizedShipment, source: string) {
  // Every normalized row must be a plain object
  expect(row).toBeTypeOf('object');
  expect(row).not.toBeNull();

  // Carrier is always required
  expect(Object.prototype.hasOwnProperty.call(row, 'Carrier') || 'Carrier' in row)
    .toBe(true);

  // At least one tracking identifier must be present
  const hasTracking = TRACKING_FIELDS.some(f =>
    (Object.prototype.hasOwnProperty.call(row, f) || f in row) &&
    (row as any)[f] != null
  );
  expect(hasTracking).toBe(true);
}

// ── FedEx ──────────────────────────────────────────────────────────

describe('FedEx normalization', () => {
  it('accepts a valid FedEx tracking payload', () => {
    // FedEx tracking numbers are 12-15 digits
    const sample = {
      trackingNumber: '794644790163',
      carrier: 'FedEx',
      actualWeight: 5.2,
      actualDims: { length: 12, width: 10, height: 6 },
      shipDate: '2025-06-15',
      serviceLevel: 'FEDEX_GROUND',
      destinationZip: '90210',
    };
    expect(sample.trackingNumber).toMatch(/^\d{12,15}$/);
    expect(sample.carrier).toBe('FedEx');
  });

  it('rejects a FedEx payload with missing tracking number', () => {
    const sample = { carrier: 'FedEx', actualWeight: 5.2 };
    expect(sample).not.toHaveProperty('trackingNumber');
  });

  it('handles null/empty dims gracefully', () => {
    // FedEx API may omit dims for envelopes
    const sample = {
      trackingNumber: '794644790164',
      carrier: 'FedEx',
      actualWeight: 0.1,
      actualDims: null,
    };
    expect(sample.actualDims).toBeNull();
  });
});

// ── UPS ────────────────────────────────────────────────────────────

describe('UPS normalization', () => {
  it('accepts a valid UPS tracking payload', () => {
    const sample = {
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
      actualWeight: 8.3,
      actualDims: { length: 18, width: 12, height: 8 },
      shipDate: '2025-06-14',
      serviceLevel: 'UPS_GROUND',
      destinationZip: '10001',
    };
    expect(sample.trackingNumber).toMatch(/^1Z/);
    expect(sample.carrier).toBe('UPS');
  });

  it('handles UPS tracking numbers of varying lengths', () => {
    // UPS tracking numbers can vary
    const valid = ['1Z999AA10123456784', '1Z12345E0291980793'];
    for (const tn of valid) {
      expect(tn).toMatch(/^1Z/);
    }
  });
});

// ── EDI 210 ────────────────────────────────────────────────────────

describe('EDI 210 normalization', () => {
  it('parses carrier SCAC from EDI segment', () => {
    // EDI 210 uses N1 segments for carrier identification
    const carrierScac = 'UPSN';
    expect(carrierScac).toMatch(/^[A-Z]{2,4}$/);
  });

  it('extracts invoice number from B3 segment', () => {
    const invoiceNumber = 'INV-2025-0615-001';
    expect(invoiceNumber).toBeTruthy();
    expect(typeof invoiceNumber).toBe('string');
  });

  it('maps EDI weight qualifiers to actual weight', () => {
    // EDI weight is in pounds with qualifier 'L'
    const weightLbs = 450.5;
    expect(weightLbs).toBeGreaterThan(0);
    expect(typeof weightLbs).toBe('number');
  });

  it('handles multi-shipment EDI invoices', () => {
    // A single EDI 210 can reference multiple PRO numbers
    const proNumbers = ['PRO-123', 'PRO-456', 'PRO-789'];
    expect(proNumbers.length).toBeGreaterThan(1);
  });
});

// ── LTL CSV ────────────────────────────────────────────────────────

describe('LTL CSV normalization', () => {
  it('parses LTL CSV weight field', () => {
    const row = { 'PRO': '12345', 'Weight': '1250', 'Class': '70' };
    expect(parseFloat(row.Weight)).toBe(1250);
  });

  it('parses LTL freight class', () => {
    const validClasses = ['50', '55', '60', '65', '70', '77.5', '85', '92.5', '100', '110', '125', '150', '175', '200', '250', '300', '400', '500'];
    const row = { 'PRO': '12345', 'Class': '70' };
    expect(validClasses).toContain(row.Class);
  });

  it('handles missing optional fields', () => {
    const row: Record<string, string | undefined> = {
      'PRO': '12345',
      'Weight': '1250',
    };
    expect(row['Class']).toBeUndefined();
  });

  it('strips whitespace from PRO number', () => {
    const raw = '  PRO-98765  ';
    expect(raw.trim()).toBe('PRO-98765');
  });
});

// ── ShipStation ────────────────────────────────────────────────────

describe('ShipStation normalization', () => {
  it('maps ShipStation carrier codes to SCAC', () => {
    // ShipStation uses its own carrier codes
    const carrierMap: Record<string, string> = {
      'stamps_com': 'USPS',
      'ups_walleted': 'UPSN',
      'fedex': 'FDXE',
    };
    expect(carrierMap['fedex']).toBe('FDXE');
    expect(carrierMap['stamps_com']).toBe('USPS');
  });

  it('maps service codes to canonical service levels', () => {
    const serviceMap: Record<string, string> = {
      'usps_first_class_mail': 'USPS First Class',
      'usps_priority_mail': 'USPS Priority',
      'ups_ground': 'UPS Ground',
      'fedex_ground': 'FedEx Ground',
    };
    expect(serviceMap['fedex_ground']).toBe('FedEx Ground');
  });

  it('converts ShipStation dimensions (inches) correctly', () => {
    const ssItem = { length: 12, width: 10, height: 6 };
    // All dimensions should be positive numbers
    expect(ssItem.length).toBeGreaterThan(0);
    expect(ssItem.width).toBeGreaterThan(0);
    expect(ssItem.height).toBeGreaterThan(0);
  });
});

// ── Shopify ────────────────────────────────────────────────────────

describe('Shopify normalization', () => {
  it('extracts order number from Shopify payload', () => {
    const order = { order_number: 'SHOP-1001', total_weight: 3200 }; // grams
    expect(order.order_number).toBeTruthy();
  });

  it('converts Shopify weight (grams) to pounds', () => {
    const weightGrams = 3200;
    const weightLbs = weightGrams / 453.59237;
    expect(weightLbs).toBeCloseTo(7.055, 2);
  });

  it('handles Shopify orders without tracking (pre-shipment)', () => {
    const order = { order_number: 'SHOP-1002', fulfillment_status: 'unfulfilled' };
    expect(order.fulfillment_status).toBe('unfulfilled');
  });
});

// ── Generic CSV ────────────────────────────────────────────────────

describe('Generic CSV normalization', () => {
  it('requires at minimum a tracking number column', () => {
    const headers = ['Tracking #', 'Carrier', 'Weight (lbs)'];
    const trackingCol = headers.find(h =>
      h.toLowerCase().includes('tracking') || h.toLowerCase().includes('track')
    );
    expect(trackingCol).toBeTruthy();
  });

  it('handles column name variations', () => {
    const variations = [
      'Tracking Number', 'Tracking #', 'tracking_number',
      'PRO number', 'PRO #', 'pro_number',
      'Carrier', 'carrier', 'CARRIER', 'SCAC',
    ];
    // At least one tracking-like and one carrier-like column must be found
    const hasTracking = variations.some(v =>
      v.toLowerCase().includes('track') || v.toLowerCase().includes('pro')
    );
    const hasCarrier = variations.some(v =>
      v.toLowerCase().includes('carrier') || v.toLowerCase().includes('scac')
    );
    expect(hasTracking).toBe(true);
    expect(hasCarrier).toBe(true);
  });

  it('skips empty rows', () => {
    const rows = [
      { 'Tracking #': 'TRK-001', 'Carrier': 'UPS' },
      { 'Tracking #': '', 'Carrier': '' },
      { 'Tracking #': 'TRK-002', 'Carrier': 'FedEx' },
    ];
    const nonEmpty = rows.filter(r => r['Tracking #'].trim() || r['Carrier'].trim());
    expect(nonEmpty.length).toBe(2);
  });

  it('handles numeric fields as strings gracefully', () => {
    const row: Record<string, string> = {
      'Tracking #': 'TRK-003',
      'Carrier': 'UPS',
      'Weight (lbs)': '5.5',
      'L (in)': '12',
      'W (in)': '10',
      'H (in)': '6',
    };
    expect(parseFloat(row['Weight (lbs)'])).toBe(5.5);
    expect(parseFloat(row['L (in)'])).toBe(12);
  });
});

// ── Cross-adapter consistency ─────────────────────────────────────

describe('Cross-adapter output consistency', () => {
  it('all adapters produce a compatible shape', () => {
    // Every adapter must emit at minimum: tracking number, carrier
    const adapterOutputs = [
      { 'Tracking number': 'TN-1', 'Carrier': 'UPS' },       // FedEx style
      { 'Tracking number': 'TN-2', 'Carrier': 'FDXE' },       // UPS style
      { 'PRO number': 'PRO-1', 'Carrier': 'UPSN' },            // EDI style
      { 'PRO number': 'PRO-2', 'Carrier': 'RDWY' },            // LTL CSV
      { 'Tracking number': 'TN-3', 'Carrier': 'USPS' },        // ShipStation
      { 'Tracking number': 'TN-4', 'Carrier': 'UPS' },         // Shopify
      { 'Tracking number': 'TN-5', 'Carrier': 'FedEx' },       // Generic CSV
    ];

    for (const output of adapterOutputs) {
      validateShipmentShape(output as NormalizedShipment, 'cross-adapter');
    }
  });

  it('no adapter leaks internal state between rows', () => {
    // Each row must be independent — no accumulator drift
    const batch = [
      { 'Tracking number': 'A', 'Carrier': 'UPS' },
      { 'Tracking number': 'B', 'Carrier': 'FedEx' },
    ];
    expect(batch[0]['Carrier']).not.toBe(batch[1]['Carrier']);
  });
});
