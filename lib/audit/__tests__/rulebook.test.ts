import { describe, it, expect } from 'vitest';
import { createResolver, emptyResolver, type RulebookRow } from '../rulebook';

// ── helpers ──────────────────────────────────────────────────
function row(overrides: Partial<RulebookRow> & Pick<RulebookRow, 'scope' | 'rule_key'>): RulebookRow {
  return {
    id: `row-${Math.random().toString(36).slice(2, 8)}`,
    client_id: null,
    carrier_scac: null,
    service_level: null,
    num_value: null,
    bool_value: null,
    text_value: null,
    effective_from: null,
    effective_to: null,
    clause_ref: null,
    ...overrides,
  };
}

// ── emptyResolver ────────────────────────────────────────────
describe('emptyResolver', () => {
  const R = emptyResolver();

  it('returns numeric fallback', () => {
    expect(R.num('dim_divisor', {}, 139)).toBe(139);
  });

  it('returns boolean fallback', () => {
    expect(R.bool('residential_waived', {}, false)).toBe(false);
  });

  it('returns text fallback', () => {
    expect(R.text('pricing_model', {}, 'fixed_rate')).toBe('fixed_rate');
  });

  it('returns null clause', () => {
    expect(R.clause('dim_divisor', {})).toBeNull();
  });
});

// ── scope precedence ─────────────────────────────────────────
describe('createResolver — scope precedence', () => {
  const rows: RulebookRow[] = [
    row({ scope: 'global', rule_key: 'dim_divisor', num_value: 139 }),
    row({ scope: 'carrier', rule_key: 'dim_divisor', carrier_scac: 'UPSN', num_value: 150 }),
    row({ scope: 'contract', rule_key: 'dim_divisor', client_id: 'c1', carrier_scac: 'UPSN', num_value: 166 }),
  ];
  const R = createResolver(rows);

  it('global wins when no scac/client match', () => {
    expect(R.num('dim_divisor', {}, 0)).toBe(139);
  });

  it('carrier wins over global when scac matches', () => {
    expect(R.num('dim_divisor', { scac: 'UPSN' }, 0)).toBe(150);
  });

  it('contract wins over carrier when client+scac match', () => {
    expect(R.num('dim_divisor', { clientId: 'c1', scac: 'UPSN' }, 0)).toBe(166);
  });

  it('carrier row does not match different scac', () => {
    expect(R.num('dim_divisor', { scac: 'FEDX' }, 0)).toBe(139);
  });

  it('contract row does not match different client', () => {
    expect(R.num('dim_divisor', { clientId: 'c2', scac: 'UPSN' }, 0)).toBe(150);
  });
});

// ── service-level specificity bonus (+5) ─────────────────────
describe('createResolver — service-level specificity', () => {
  const rows: RulebookRow[] = [
    row({ scope: 'carrier', rule_key: 'sla_transit_days', carrier_scac: 'UPSN', num_value: 5 }),
    row({ scope: 'carrier', rule_key: 'sla_transit_days', carrier_scac: 'UPSN', service_level: 'Ground', num_value: 3 }),
  ];
  const R = createResolver(rows);

  it('service-specific row wins over generic within same scope', () => {
    expect(R.num('sla_transit_days', { scac: 'UPSN', serviceLevel: 'Ground' }, 0)).toBe(3);
  });

  it('generic row returned when service does not match', () => {
    expect(R.num('sla_transit_days', { scac: 'UPSN', serviceLevel: '2-Day' }, 0)).toBe(5);
  });

  it('generic row returned when no service provided', () => {
    expect(R.num('sla_transit_days', { scac: 'UPSN' }, 0)).toBe(5);
  });
});

// ── effective dating ─────────────────────────────────────────
describe('createResolver — effective dating', () => {
  // Use carrier scope for the dated row so it scores higher (20) than global (10)
  // when the date window matches, demonstrating date filtering works.
  const rows: RulebookRow[] = [
    row({ scope: 'global', rule_key: 'dim_divisor', num_value: 139 }),
    row({ scope: 'carrier', rule_key: 'dim_divisor', carrier_scac: 'UPSN', num_value: 166, effective_from: '2025-01-01', effective_to: '2025-12-31' }),
  ];
  const R = createResolver(rows);

  it('date-bounded row matches within window', () => {
    expect(R.num('dim_divisor', { scac: 'UPSN', shipDate: '2025-06-15' }, 0)).toBe(166);
  });

  it('date-bounded row excluded before window — falls back to global', () => {
    expect(R.num('dim_divisor', { scac: 'UPSN', shipDate: '2024-06-15' }, 0)).toBe(139);
  });

  it('date-bounded row excluded after window — falls back to global', () => {
    expect(R.num('dim_divisor', { scac: 'UPSN', shipDate: '2026-06-15' }, 0)).toBe(139);
  });

  it('open-ended effective_from (no end date)', () => {
    const rows2: RulebookRow[] = [
      row({ scope: 'global', rule_key: 'dim_divisor', num_value: 200, effective_from: '2025-07-01' }),
    ];
    const R2 = createResolver(rows2);
    expect(R2.num('dim_divisor', { shipDate: '2025-08-01' }, 0)).toBe(200);
    expect(R2.num('dim_divisor', { shipDate: '2025-01-01' }, 0)).toBe(0); // fallback
  });
});

// ── boolean + text value types ───────────────────────────────
describe('createResolver — bool and text values', () => {
  const rows: RulebookRow[] = [
    row({ scope: 'contract', rule_key: 'residential_waived', client_id: 'c1', carrier_scac: 'UPSN', bool_value: true }),
    row({ scope: 'global', rule_key: 'pricing_model', text_value: 'fixed_rate' }),
    row({ scope: 'contract', rule_key: 'pricing_model', client_id: 'c1', carrier_scac: '3PL1', text_value: 'cost_plus' }),
  ];
  const R = createResolver(rows);

  it('resolves boolean contract row', () => {
    expect(R.bool('residential_waived', { clientId: 'c1', scac: 'UPSN' }, false)).toBe(true);
  });

  it('boolean fallback for non-matching', () => {
    expect(R.bool('residential_waived', {}, false)).toBe(false);
  });

  it('resolves text global row', () => {
    expect(R.text('pricing_model', {}, '')).toBe('fixed_rate');
  });

  it('contract text overrides global', () => {
    expect(R.text('pricing_model', { clientId: 'c1', scac: '3PL1' }, '')).toBe('cost_plus');
  });
});

// ── clause citation ──────────────────────────────────────────
describe('createResolver — clause citations', () => {
  const rows: RulebookRow[] = [
    row({ scope: 'contract', rule_key: 'pick_base_fee', client_id: 'c1', carrier_scac: '3PL1', num_value: 2.50, clause_ref: 'Exhibit A §2.1' }),
    row({ scope: 'global', rule_key: 'dim_divisor', num_value: 139 }),
  ];
  const R = createResolver(rows);

  it('returns clause_ref for matching row', () => {
    expect(R.clause('pick_base_fee', { clientId: 'c1', scac: '3PL1' })).toBe('Exhibit A §2.1');
  });

  it('returns null when no clause_ref', () => {
    expect(R.clause('dim_divisor', {})).toBeNull();
  });

  it('returns null for non-matching key', () => {
    expect(R.clause('nonexistent', {})).toBeNull();
  });
});

// ── contract scope: carrier_scac is optional ─────────────────
describe('createResolver — contract without carrier_scac', () => {
  const rows: RulebookRow[] = [
    row({ scope: 'global', rule_key: 'dim_divisor', num_value: 139 }),
    row({ scope: 'contract', rule_key: 'dim_divisor', client_id: 'c1', num_value: 200 }),
  ];
  const R = createResolver(rows);

  it('contract with null carrier_scac matches any scac for that client', () => {
    expect(R.num('dim_divisor', { clientId: 'c1', scac: 'FEDX' }, 0)).toBe(200);
  });

  it('contract still requires clientId match', () => {
    expect(R.num('dim_divisor', { clientId: 'c2', scac: 'FEDX' }, 0)).toBe(139);
  });
});
