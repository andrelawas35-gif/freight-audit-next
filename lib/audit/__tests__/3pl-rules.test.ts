import { describe, it, expect } from 'vitest';
import {
  pickFeeRule,
  packagingRule,
  freightMarkupRule,
  ghostRule,
  duplicateFinding,
  storageRule,
  type TplFulfillmentRow,
  type TplStorageRow,
} from '../3pl-rules';
import { createResolver, emptyResolver, type RulebookRow } from '../rulebook';

// ── factories ────────────────────────────────────────────────
function fulfillmentLine(overrides: Partial<TplFulfillmentRow> = {}): TplFulfillmentRow {
  return {
    id: 'line-1',
    client_id: 'c1',
    carrier_scac: '3PL1',
    invoice_cycle: '2025-06',
    order_id: 'ORD-100',
    units_picked: 5,
    base_pick_fee: 3.00,
    additional_pick_fee: 0.75,
    packaging_fee: 2.50,
    base_freight: 15.00,
    fuel_surcharge: 2.00,
    total_billed: 25.00,
    base_carrier_cost: 12.00,
    match_status: 'matched',
    ...overrides,
  };
}

function storageLine(overrides: Partial<TplStorageRow> = {}): TplStorageRow {
  return {
    id: 'stor-1',
    client_id: 'c1',
    invoice_cycle: '2025-06',
    storage_type: 'Pallet',
    billed_amount: 50.00,
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
// PICK FEE RULE
// ═══════════════════════════════════════════════════════════════
describe('pickFeeRule', () => {
  it('returns null when fees match contract rates (no overcharge)', () => {
    const R = emptyResolver(); // fallback = line values, so billed == expected
    expect(pickFeeRule(fulfillmentLine(), R)).toBeNull();
  });

  it('flags when billed pick fees exceed contract rates', () => {
    const R = createResolver([
      row({ scope: 'contract', rule_key: 'pick_base_fee', client_id: 'c1', carrier_scac: '3PL1', num_value: 2.00 }),
      row({ scope: 'contract', rule_key: 'pick_additional_fee', client_id: 'c1', carrier_scac: '3PL1', num_value: 0.50 }),
    ]);
    // billed: 3.00 + 4*0.75 = 6.00; expected: 2.00 + 4*0.50 = 4.00; variance = 2.00
    const result = pickFeeRule(fulfillmentLine(), R);

    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('TPL_PICK_FEE');
    expect(result!.billed).toBe(6.00);
    expect(result!.expected).toBe(4.00);
    expect(result!.variance).toBe(2.00);
    expect(result!.notes).toContain('5 unit(s)');
  });

  it('returns null when both fees are null', () => {
    const line = fulfillmentLine({ base_pick_fee: null, units_picked: null });
    expect(pickFeeRule(line, emptyResolver())).toBeNull();
  });

  it('carries clause citation', () => {
    const R = createResolver([
      row({ scope: 'contract', rule_key: 'pick_base_fee', client_id: 'c1', carrier_scac: '3PL1', num_value: 1.00, clause_ref: '§3.1' }),
      row({ scope: 'contract', rule_key: 'pick_additional_fee', client_id: 'c1', carrier_scac: '3PL1', num_value: 0.25 }),
    ]);
    const result = pickFeeRule(fulfillmentLine(), R);
    expect(result!.clauseRef).toBe('§3.1');
    expect(result!.notes).toContain('[§3.1]');
  });

  it('handles single unit (no additional fees)', () => {
    const line = fulfillmentLine({ units_picked: 1, base_pick_fee: 5.00, additional_pick_fee: 0.75 });
    const R = createResolver([
      row({ scope: 'contract', rule_key: 'pick_base_fee', client_id: 'c1', carrier_scac: '3PL1', num_value: 3.00 }),
    ]);
    // billed: 5.00, expected: 3.00, variance: 2.00
    const result = pickFeeRule(line, R);
    expect(result).not.toBeNull();
    expect(result!.billed).toBe(5.00);
    expect(result!.expected).toBe(3.00);
  });
});

// ═══════════════════════════════════════════════════════════════
// PACKAGING RULE
// ═══════════════════════════════════════════════════════════════
describe('packagingRule', () => {
  it('returns null when packaging_fee is null', () => {
    const line = fulfillmentLine({ packaging_fee: null });
    expect(packagingRule(line, emptyResolver())).toBeNull();
  });

  it('returns null when fee matches contract', () => {
    const R = emptyResolver(); // fallback = line.packaging_fee
    expect(packagingRule(fulfillmentLine(), R)).toBeNull();
  });

  it('flags packaging overcharge', () => {
    const R = createResolver([
      row({ scope: 'contract', rule_key: 'packaging_fee', client_id: 'c1', carrier_scac: '3PL1', num_value: 1.50 }),
    ]);
    // billed: 2.50, expected: 1.50, variance: 1.00
    const result = packagingRule(fulfillmentLine(), R);
    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('TPL_PACKAGING');
    expect(result!.variance).toBe(1.00);
  });
});

// ═══════════════════════════════════════════════════════════════
// FREIGHT MARKUP RULE
// ═══════════════════════════════════════════════════════════════
describe('freightMarkupRule', () => {
  it('returns null for fixed_rate pricing model', () => {
    const R = emptyResolver(); // defaults to 'fixed_rate'
    expect(freightMarkupRule(fulfillmentLine(), R)).toBeNull();
  });

  it('returns TPL_DATA_REQUIRED when cost-plus but no base_carrier_cost', () => {
    const R = createResolver([
      row({ scope: 'contract', rule_key: 'pricing_model', client_id: 'c1', carrier_scac: '3PL1', text_value: 'cost_plus' }),
    ]);
    const line = fulfillmentLine({ base_carrier_cost: null });
    const result = freightMarkupRule(line, R);

    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('TPL_DATA_REQUIRED');
    expect(result!.notes).toContain('original carrier base cost');
  });

  it('flags excess markup on cost-plus contract', () => {
    const R = createResolver([
      row({ scope: 'contract', rule_key: 'pricing_model', client_id: 'c1', carrier_scac: '3PL1', text_value: 'cost_plus' }),
      row({ scope: 'contract', rule_key: 'freight_markup_pct', client_id: 'c1', carrier_scac: '3PL1', num_value: 15 }),
    ]);
    // billedFreight = 15.00 + 2.00 = 17.00
    // expected = 12.00 * 1.15 = 13.80
    // variance = 17.00 - 13.80 = 3.20
    const result = freightMarkupRule(fulfillmentLine(), R);

    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('TPL_FREIGHT_MARKUP');
    expect(result!.billed).toBe(17.00);
    expect(result!.expected).toBe(13.80);
    expect(result!.variance).toBe(3.20);
  });

  it('returns null when markup is within contract bounds', () => {
    const R = createResolver([
      row({ scope: 'contract', rule_key: 'pricing_model', client_id: 'c1', carrier_scac: '3PL1', text_value: 'cost_plus' }),
      row({ scope: 'contract', rule_key: 'freight_markup_pct', client_id: 'c1', carrier_scac: '3PL1', num_value: 50 }),
    ]);
    // billedFreight = 17.00, expected = 12 * 1.50 = 18.00, variance = -1.00 → no flag
    expect(freightMarkupRule(fulfillmentLine(), R)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// GHOST SHIPMENT RULE
// ═══════════════════════════════════════════════════════════════
describe('ghostRule', () => {
  it('returns null when match_status is not unmatched', () => {
    expect(ghostRule(fulfillmentLine({ match_status: 'matched' }))).toBeNull();
  });

  it('flags unmatched lines as ghost shipments', () => {
    const line = fulfillmentLine({ match_status: 'unmatched', total_billed: 42.50 });
    const result = ghostRule(line);

    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('TPL_GHOST_SHIPMENT');
    expect(result!.billed).toBe(42.50);
    expect(result!.variance).toBe(42.50);
    expect(result!.expected).toBe(0);
    expect(result!.notes).toContain('ghost shipment');
    expect(result!.notes).toContain('ORD-100');
  });

  it('handles null total_billed', () => {
    const line = fulfillmentLine({ match_status: 'unmatched', total_billed: null });
    const result = ghostRule(line);
    expect(result!.billed).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// DUPLICATE FINDING
// ═══════════════════════════════════════════════════════════════
describe('duplicateFinding', () => {
  it('creates a finding with prior cycle reference', () => {
    const line = fulfillmentLine({ total_billed: 100 });
    const result = duplicateFinding(line, '2025-05');

    expect(result.ruleCode).toBe('TPL_DUPLICATE');
    expect(result.billed).toBe(100);
    expect(result.variance).toBe(100);
    expect(result.notes).toContain('2025-05');
    expect(result.notes).toContain('ORD-100');
  });
});

// ═══════════════════════════════════════════════════════════════
// STORAGE RULE
// ═══════════════════════════════════════════════════════════════
describe('storageRule', () => {
  it('returns null when billed_amount is null', () => {
    const line = storageLine({ billed_amount: null });
    expect(storageRule(line, emptyResolver())).toBeNull();
  });

  it('returns null when rate matches contract', () => {
    expect(storageRule(storageLine(), emptyResolver())).toBeNull();
  });

  it('flags storage overcharge', () => {
    const R = createResolver([
      row({
        scope: 'contract', rule_key: 'storage_rate',
        client_id: 'c1', service_level: 'Pallet', num_value: 35.00,
      }),
    ]);
    // billed: 50.00, expected: 35.00, variance: 15.00
    const result = storageRule(storageLine(), R);

    expect(result).not.toBeNull();
    expect(result!.ruleCode).toBe('TPL_STORAGE');
    expect(result!.billed).toBe(50.00);
    expect(result!.expected).toBe(35.00);
    expect(result!.variance).toBe(15.00);
    expect(result!.notes).toContain('Pallet');
  });

  it('uses storage_type as serviceLevel for resolution', () => {
    const R = createResolver([
      row({ scope: 'contract', rule_key: 'storage_rate', client_id: 'c1', service_level: 'Bin', num_value: 10.00 }),
      row({ scope: 'contract', rule_key: 'storage_rate', client_id: 'c1', service_level: 'Pallet', num_value: 40.00 }),
    ]);
    // Pallet line billed 50, contract rate 40 → variance 10
    const palletResult = storageRule(storageLine({ storage_type: 'Pallet', billed_amount: 50 }), R);
    expect(palletResult).not.toBeNull();
    expect(palletResult!.expected).toBe(40.00);

    // Bin line billed 20, contract rate 10 → variance 10
    const binResult = storageRule(storageLine({ storage_type: 'Bin', billed_amount: 20 }), R);
    expect(binResult).not.toBeNull();
    expect(binResult!.expected).toBe(10.00);
  });
});
