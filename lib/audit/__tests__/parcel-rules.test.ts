import { describe, it, expect } from 'vitest';
import { dimWeightRule } from '../rules/dim-weight';
import { phantomAccessorialRule } from '../rules/phantom-accessorial';
import { duplicateTrackingRule } from '../rules/duplicate-tracking';
import { slaFailureRule } from '../rules/sla-failure';
import { createResolver, emptyResolver, type RulebookRow } from '../rulebook';
import type { Invoice, Shipment } from '@/lib/types';
import type { RuleContext } from '../types';

// ── factories ────────────────────────────────────────────────
function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    'Invoice number': 'INV-001',
    'Amount billed': 50,
    'Carrier': 'UPSN',
    'Clients': ['client-1'],
    'Invoice date': '2025-06-01',
    'Shipment': ['ship-1'],
    ...overrides,
  };
}

function makeShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: 'ship-1',
    'PRO number': 'PRO-123',
    'Tracking number': 'TRK-456',
    'Actual L': 12,
    'Actual W': 10,
    'Actual H': 8,
    'Actual weight lbs': 5,
    'Ship date': '2025-06-01',
    'Delivery date': '2025-06-02',
    'Service level': 'Ground',
    'Carrier': 'UPSN',
    'Destination zip': '90210',
    'Address classification': 'Commercial',
    ...overrides,
  };
}

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    allInvoices: [],
    resolver: emptyResolver(),
    ...overrides,
  };
}

function row(overrides: Partial<RulebookRow> & Pick<RulebookRow, 'scope' | 'rule_key'>): RulebookRow {
  return {
    id: `r-${Math.random().toString(36).slice(2, 8)}`,
    client_id: null, carrier_scac: null, service_level: null,
    num_value: null, bool_value: null, text_value: null,
    effective_from: null, effective_to: null, clause_ref: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// DIM WEIGHT RULE
// ═══════════════════════════════════════════════════════════════
describe('dimWeightRule', () => {
  it('returns null when no shipment', () => {
    expect(dimWeightRule(makeInvoice(), null, ctx())).toBeNull();
  });

  it('returns null when dimensions are missing', () => {
    const shipment = makeShipment({ 'Actual L': undefined });
    expect(dimWeightRule(makeInvoice(), shipment, ctx())).toBeNull();
  });

  it('returns null when actual weight >= dim weight', () => {
    // 12*10*8 = 960; 960/139 = 6.9 → ceil = 7. actual = 10 → no flag
    const shipment = makeShipment({ 'Actual weight lbs': 10 });
    expect(dimWeightRule(makeInvoice(), shipment, ctx())).toBeNull();
  });

  it('returns null when variance < $1', () => {
    // dim = ceil(960/139) = 7, actual = 5, ratio = 5/7 * 8 = 5.71, variance = 2.29
    // Need billed low enough that variance < $1: billed = 3 → expected = (5/7)*3 = 2.14, var = 0.86
    const invoice = makeInvoice({ 'Amount billed': 3 });
    const shipment = makeShipment({ 'Actual weight lbs': 5 });
    expect(dimWeightRule(invoice, shipment, ctx())).toBeNull();
  });

  it('flags overcharge when dim weight exceeds actual', () => {
    // dims 12*10*8 = 960, divisor 139, dimWeight = ceil(960/139) = 7
    // actual = 5, billed = 50
    // expected = (5/7)*50 = 35.71, variance = 14.29
    const invoice = makeInvoice({ 'Amount billed': 50 });
    const shipment = makeShipment({ 'Actual weight lbs': 5 });
    const result = dimWeightRule(invoice, shipment, ctx());

    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('DIM_WEIGHT_TRAP');
    expect(result!.outcome).toBe('FLAGGED');
    expect(result!.billedAmount).toBe(50);
    expect(result!.variance).toBeGreaterThan(1);
    expect(result!.invoiceId).toBe('inv-1');
    expect(result!.shipmentId).toBe('ship-1');
  });

  it('uses rulebook dim_divisor when available', () => {
    // With divisor 166: dimWeight = ceil(960/166) = 6, actual = 5
    // expected = (5/6)*50 = 41.67, variance = 8.33
    const R = createResolver([
      row({ scope: 'global', rule_key: 'dim_divisor', num_value: 166 }),
    ]);
    const invoice = makeInvoice({ 'Amount billed': 50 });
    const shipment = makeShipment({ 'Actual weight lbs': 5 });
    const result = dimWeightRule(invoice, shipment, ctx({ resolver: R }));

    expect(result).not.toBeNull();
    // With 166 divisor, dimWeight = 6 vs actual 5 → still flags
    expect(result!.ruleCode).toBe('DIM_WEIGHT_TRAP');
    // Variance with 166 divisor should be less than with 139
    const resultDefault = dimWeightRule(invoice, shipment, ctx());
    expect(result!.variance).toBeLessThan(resultDefault!.variance);
  });
});

// ═══════════════════════════════════════════════════════════════
// PHANTOM ACCESSORIAL RULE
// ═══════════════════════════════════════════════════════════════
describe('phantomAccessorialRule', () => {
  it('returns null when no shipment', () => {
    expect(phantomAccessorialRule(makeInvoice(), null, ctx())).toBeNull();
  });

  it('returns null for residential address without waiver', () => {
    const shipment = makeShipment({ 'Address classification': 'Residential' });
    expect(phantomAccessorialRule(makeInvoice(), shipment, ctx())).toBeNull();
  });

  it('flags commercial address (residential surcharge mis-applied)', () => {
    const shipment = makeShipment({ 'Address classification': 'Commercial' });
    const result = phantomAccessorialRule(makeInvoice(), shipment, ctx());

    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('PHANTOM_ACCESSORIAL');
    expect(result!.variance).toBe(5.50); // default surcharge
    expect(result!.notes).toContain('commercial address');
  });

  it('flags when contract waives residential surcharge', () => {
    const R = createResolver([
      row({ scope: 'contract', rule_key: 'residential_waived', client_id: 'client-1', carrier_scac: 'UPSN', bool_value: true }),
    ]);
    const shipment = makeShipment({ 'Address classification': 'Residential' });
    const result = phantomAccessorialRule(makeInvoice(), shipment, ctx({ resolver: R }));

    expect(result).not.toBeNull();
    expect(result!.notes).toContain('contract waives');
  });

  it('uses rulebook surcharge rate', () => {
    const R = createResolver([
      row({ scope: 'carrier', rule_key: 'residential_surcharge', carrier_scac: 'UPSN', num_value: 8.00 }),
    ]);
    const shipment = makeShipment({ 'Address classification': 'Commercial' });
    const result = phantomAccessorialRule(makeInvoice(), shipment, ctx({ resolver: R }));

    expect(result!.variance).toBe(8.00);
  });

  it('returns null when billed amount is missing', () => {
    const invoice = makeInvoice({ 'Amount billed': undefined });
    const shipment = makeShipment({ 'Address classification': 'Commercial' });
    expect(phantomAccessorialRule(invoice, shipment, ctx())).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// DUPLICATE TRACKING RULE
// ═══════════════════════════════════════════════════════════════
describe('duplicateTrackingRule', () => {
  it('returns null when no shipment', () => {
    expect(duplicateTrackingRule(makeInvoice(), null, ctx())).toBeNull();
  });

  it('returns null when no PRO or tracking number', () => {
    const shipment = makeShipment({ 'PRO number': undefined, 'Tracking number': undefined });
    expect(duplicateTrackingRule(makeInvoice(), shipment, ctx())).toBeNull();
  });

  it('returns null when no duplicates exist', () => {
    const invoice = makeInvoice();
    const shipment = makeShipment();
    const result = duplicateTrackingRule(invoice, shipment, ctx({ allInvoices: [invoice] }));
    expect(result).toBeNull();
  });

  it('flags when duplicate invoice exists (same carrier, date, amount)', () => {
    const invoice1 = makeInvoice({ id: 'inv-1', 'Invoice number': 'INV-001' });
    const invoice2 = makeInvoice({ id: 'inv-2', 'Invoice number': 'INV-002' });
    const allInvoices = [invoice1, invoice2];
    const shipment = makeShipment();

    const result = duplicateTrackingRule(invoice1, shipment, ctx({ allInvoices }));

    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('DUPLICATE_TRACKING');
    expect(result!.variance).toBe(50);
    expect(result!.notes).toContain('Duplicate billing');
    expect(result!.notes).toContain('INV-002');
  });

  it('flags when carrier differs (same PRO = duplicate regardless of carrier)', () => {
    const invoice1 = makeInvoice({ id: 'inv-1', 'Invoice number': 'INV-001', 'Carrier': 'UPSN' });
    const invoice2 = makeInvoice({ id: 'inv-2', 'Invoice number': 'INV-002', 'Carrier': 'FEDX' });
    const result = duplicateTrackingRule(invoice1, makeShipment(), ctx({ allInvoices: [invoice1, invoice2] }));
    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('DUPLICATE_TRACKING');
    expect(result!.notes).toContain('INV-002');
  });

  it('flags when date differs (same PRO = duplicate regardless of date)', () => {
    const invoice1 = makeInvoice({ id: 'inv-1', 'Invoice number': 'INV-001', 'Invoice date': '2025-06-01' });
    const invoice2 = makeInvoice({ id: 'inv-2', 'Invoice number': 'INV-002', 'Invoice date': '2025-06-02' });
    const result = duplicateTrackingRule(invoice1, makeShipment(), ctx({ allInvoices: [invoice1, invoice2] }));
    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('DUPLICATE_TRACKING');
    expect(result!.notes).toContain('INV-002');
  });

  it('does not flag when no shared PRO/tracking between invoices', () => {
    const invoice1 = makeInvoice({ id: 'inv-1', 'Invoice number': 'INV-001', 'Shipment': ['ship-1'] });
    const invoice2 = makeInvoice({ id: 'inv-2', 'Invoice number': 'INV-002', 'Shipment': ['ship-2'] });
    const shipment1 = makeShipment({ id: 'ship-1', 'PRO number': 'PRO-A', 'Tracking number': 'TRK-A' });
    const shipment2 = makeShipment({ id: 'ship-2', 'PRO number': 'PRO-B', 'Tracking number': 'TRK-B' });
    const result = duplicateTrackingRule(invoice1, shipment1, ctx({
      allInvoices: [invoice1, invoice2],
      allShipments: [shipment1, shipment2],
    }));
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// SLA FAILURE RULE
// ═══════════════════════════════════════════════════════════════
describe('slaFailureRule', () => {
  it('returns null when no shipment', () => {
    expect(slaFailureRule(makeInvoice(), null, ctx())).toBeNull();
  });

  it('returns null when service level is missing', () => {
    const shipment = makeShipment({ 'Service level': undefined });
    expect(slaFailureRule(makeInvoice(), shipment, ctx())).toBeNull();
  });

  it('returns null when delivery is on time', () => {
    // Ground = 5 business days; ship Mon Jun 2 → deliver Fri Jun 6 = 4 business days
    const shipment = makeShipment({
      'Service level': 'Ground',
      'Ship date': '2025-06-02',
      'Delivery date': '2025-06-06',
    });
    expect(slaFailureRule(makeInvoice(), shipment, ctx())).toBeNull();
  });

  it('flags late Next Day Air delivery', () => {
    // Next Day Air = 1 business day; ship Mon Jun 2 → deliver Wed Jun 4 = 2 biz days, 1 late
    const shipment = makeShipment({
      'Service level': 'Next Day Air',
      'Ship date': '2025-06-02',
      'Delivery date': '2025-06-04',
    });
    const result = slaFailureRule(makeInvoice(), shipment, ctx());

    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('SLA_FAILURE');
    expect(result!.outcome).toBe('FLAGGED');
    expect(result!.variance).toBe(50); // full refund
    expect(result!.notes).toContain('1 day(s) late');
  });

  it('uses LTL_SLA_FAILURE code for LTL services', () => {
    const shipment = makeShipment({
      'Service level': 'LTL Guaranteed',
      'Ship date': '2025-06-02',
      'Delivery date': '2025-06-05', // 3 biz days, 2 late
    });
    const result = slaFailureRule(makeInvoice(), shipment, ctx());

    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('LTL_SLA_FAILURE');
  });

  it('returns null when guarantee is disabled in contract', () => {
    const R = createResolver([
      row({ scope: 'contract', rule_key: 'guarantee_enabled', client_id: 'client-1', carrier_scac: 'UPSN', bool_value: false }),
    ]);
    const shipment = makeShipment({
      'Service level': 'Next Day Air',
      'Ship date': '2025-06-02',
      'Delivery date': '2025-06-04',
    });
    expect(slaFailureRule(makeInvoice(), shipment, ctx({ resolver: R }))).toBeNull();
  });

  it('uses rulebook sla_transit_days over built-in defaults', () => {
    const R = createResolver([
      row({ scope: 'carrier', rule_key: 'sla_transit_days', carrier_scac: 'UPSN', service_level: 'Ground', num_value: 3 }),
    ]);
    // With 3-day SLA: ship Mon Jun 2 → deliver Mon Jun 9 = 5 biz days, 2 late
    const shipment = makeShipment({
      'Service level': 'Ground',
      'Ship date': '2025-06-02',
      'Delivery date': '2025-06-09',
    });
    const result = slaFailureRule(makeInvoice(), shipment, ctx({ resolver: R }));

    expect(result).not.toBeNull();
    expect(result!.notes).toContain('promised 3 business day(s)');
  });

  it('skips weekends in business day calculation', () => {
    // Ship Friday Jun 6 → deliver Monday Jun 9 = 1 business day (Mon)
    // Next Day Air = 1 day → on time
    const shipment = makeShipment({
      'Service level': 'Next Day Air',
      'Ship date': '2025-06-06',
      'Delivery date': '2025-06-09',
    });
    expect(slaFailureRule(makeInvoice(), shipment, ctx())).toBeNull();
  });

  it('returns null for unknown service level', () => {
    const shipment = makeShipment({
      'Service level': 'Carrier Pigeon Express',
      'Ship date': '2025-06-02',
      'Delivery date': '2025-06-20',
    });
    expect(slaFailureRule(makeInvoice(), shipment, ctx())).toBeNull();
  });
});
