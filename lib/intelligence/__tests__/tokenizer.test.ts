/**
 * T1 Tokenizer Tests (ADR 0012 D2)
 *
 * Covers:
 * 1. Standard clause matching — each rule_key category
 * 2. Parameter extraction accuracy (dollar amounts, carrier names)
 * 3. Null return for unmatched clauses
 * 4. Collision resolution (longer match wins)
 * 5. tokenizeAll and tokenizeStats
 * 6. <5ms per-clause latency benchmark
 */

import { describe, expect, it } from 'vitest';
import { tokenize, tokenizeAll, tokenizeStats, type TokenizerHit } from '../tokenizer';

// ── Helpers ───────────────────────────────────────────────────────────

function expectHit(result: TokenizerHit | null): asserts result is TokenizerHit {
  expect(result).not.toBeNull();
}

// ── 1. Declared Value Limits ──────────────────────────────────────────

describe('T1 tokenizer — declared value limits', () => {
  it('matches "declared value shall not exceed $X"', () => {
    const hit = tokenize('The declared value shall not exceed $25,000 per shipment.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('declared_value_limit');
    expect(hit.conditionFragment.declaredValueLte).toBe(25000);
    expect(hit.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('matches "maximum declared value of $X"', () => {
    const hit = tokenize('Maximum declared value of $50,000.00 for any single shipment.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('declared_value_limit');
    expect(hit.conditionFragment.declaredValueLte).toBe(50000);
  });

  it('matches "shipments valued over $X require"', () => {
    const hit = tokenize('Shipments valued over $10,000 require additional insurance.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('declared_value_threshold_action');
    expect(hit.conditionFragment.declaredValueGt).toBe(10000);
  });

  it('matches "shipments valued at least $X"', () => {
    const hit = tokenize('Shipments valued at least $5,000 must use express service.');
    expectHit(hit);
    expect(hit.conditionFragment.declaredValueGte).toBe(5000);
  });

  it('matches "minimum declared value of $X"', () => {
    const hit = tokenize('Minimum declared value of $1,000 applies to all shipments.');
    expectHit(hit);
    expect(hit.conditionFragment.declaredValueGte).toBe(1000);
  });

  it('returns null for non-matching clause', () => {
    const hit = tokenize('All shipments must be properly packaged.');
    expect(hit).toBeNull();
  });
});

// ── 2. Signature Requirements ─────────────────────────────────────────

describe('T1 tokenizer — signature requirements', () => {
  it('matches "signature required for shipments over $X"', () => {
    const hit = tokenize('Signature required for all shipments over $5,000.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('signature_above_threshold');
    expect(hit.conditionFragment.signatureRequiredAbove).toBe(5000);
  });

  it('matches "adult signature required"', () => {
    const hit = tokenize('Adult signature required for all jewelry shipments.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('signature_type');
    expect(hit.conditionFragment.signatureTypeIn).toContain('adult_direct');
  });

  it('matches "direct signature required"', () => {
    const hit = tokenize('Direct signature required on delivery.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('signature_type');
    expect(hit.conditionFragment.signatureTypeIn).toContain('direct');
  });

  it('matches "indirect signature permitted"', () => {
    const hit = tokenize('Indirect signature is permitted for residential deliveries.');
    expectHit(hit);
    expect(hit.conditionFragment.signatureTypeIn).toContain('indirect');
    expect(hit.actionFragment.decision).toBe('ALLOW');
  });

  it('matches "adult signature above $X" combined pattern', () => {
    const hit = tokenize('Adult signature required for shipments over $10,000.');
    expectHit(hit);
    expect(hit.conditionFragment.signatureRequiredAbove).toBe(10000);
    expect(hit.conditionFragment.signatureTypeIn).toContain('adult_direct');
  });
});

// ── 3. Carrier Restrictions ───────────────────────────────────────────

describe('T1 tokenizer — carrier restrictions', () => {
  it('matches "shall not be shipped via [carrier]"', () => {
    const hit = tokenize('Jewelry shall not be shipped via USPS.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('carrier_excluded');
    expect(hit.conditionFragment.carrierNotIn).toContain('USPS');
  });

  it('matches "not authorized for [carrier]"', () => {
    const hit = tokenize('Fine art is not authorized for FedEx Ground shipments.');
    expectHit(hit);
    expect(hit.conditionFragment.carrierNotIn).toContain('FedEx');
  });

  it('matches "excluded carrier: [carrier]"', () => {
    const hit = tokenize('Excluded carrier: DHL.');
    expectHit(hit);
    expect(hit.conditionFragment.carrierNotIn).toContain('DHL');
  });

  it('matches "must be shipped via [carrier]"', () => {
    const hit = tokenize('High-value electronics must be shipped via UPS.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('carrier_required');
    expect(hit.conditionFragment.carrierIn).toContain('UPS');
  });

  it('matches "authorized carriers: [carrier]"', () => {
    const hit = tokenize('Authorized carriers: FedEx.');
    expectHit(hit);
    expect(hit.conditionFragment.carrierIn).toContain('FedEx');
  });

  it('normalizes carrier aliases', () => {
    const hit = tokenize('Shall not be shipped via Federal Express.');
    expectHit(hit);
    expect(hit.conditionFragment.carrierNotIn).toContain('FedEx');
  });

  it('normalizes R+L carriers', () => {
    const hit = tokenize('Not authorized for R&L shipments.');
    expectHit(hit);
    expect(hit.conditionFragment.carrierNotIn).toContain('R+L');
  });
});

// ── 4. Service Level Restrictions ─────────────────────────────────────

describe('T1 tokenizer — service level restrictions', () => {
  it('matches "must use X service"', () => {
    const hit = tokenize('Perishable items must use Overnight service.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('service_required');
    expect(hit.conditionFragment.serviceIn).toContain('Overnight');
  });

  it('matches "ground service not permitted"', () => {
    const hit = tokenize('Ground service is not permitted for temperature-sensitive items.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('service_excluded');
    expect(hit.conditionFragment.serviceNotIn).toContain('Ground');
  });

  it('matches "shall not use X service"', () => {
    const hit = tokenize('The shipper shall not use Economy shipping for declared values over $1,000.');
    expectHit(hit);
    expect(hit.conditionFragment.serviceNotIn).toContain('Economy');
  });
});

// ── 5. Temperature Control ────────────────────────────────────────────

describe('T1 tokenizer — temperature control', () => {
  it('matches "temperature-controlled shipping required"', () => {
    const hit = tokenize('Temperature-controlled shipping is required for all pharmaceutical products.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('temperature_control');
    expect(hit.conditionFragment.temperatureControlRequired).toBe(true);
    expect(hit.category).toBe('TEMPERATURE_CONTROL_MISSING');
  });

  it('matches "cold chain required"', () => {
    const hit = tokenize('Cold chain logistics is required for vaccine transport.');
    expectHit(hit);
    expect(hit.conditionFragment.temperatureControlRequired).toBe(true);
  });

  it('matches perishable temperature monitoring clause', () => {
    const hit = tokenize('Perishable goods shall be transported with temperature monitoring.');
    expectHit(hit);
    expect(hit.conditionFragment.temperatureControlRequired).toBe(true);
  });

  it('matches "refrigerated transport required"', () => {
    const hit = tokenize('Refrigerated freight is required for this commodity.');
    expectHit(hit);
    expect(hit.conditionFragment.temperatureControlRequired).toBe(true);
  });
});

// ── 6. Documentation Requirements ─────────────────────────────────────

describe('T1 tokenizer — documentation requirements', () => {
  it('matches "certificate of insurance required"', () => {
    const hit = tokenize('A certificate of insurance is required prior to shipment.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('documentation_required');
    expect(hit.conditionFragment.documentationRequired).toContain('certificate_of_insurance');
    expect(hit.actionFragment.decision).toBe('REQUIRE_DOCUMENTATION');
  });

  it('matches "appraisal required"', () => {
    const hit = tokenize('An independent appraisal is required for all fine art shipments.');
    expectHit(hit);
    expect(hit.conditionFragment.documentationRequired).toContain('appraisal');
  });

  it('matches "serial number required"', () => {
    const hit = tokenize('Serial numbers are required for all electronics.');
    expectHit(hit);
    expect(hit.conditionFragment.documentationRequired).toContain('serial_number');
  });
});

// ── 7. Insurance Coverage ─────────────────────────────────────────────

describe('T1 tokenizer — insurance coverage', () => {
  it('matches "insured for full declared value"', () => {
    const hit = tokenize('All shipments must be insured for the full declared value.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('full_value_insurance');
    expect(hit.conditionFragment.insuredValueLtDeclared).toBe(true);
  });

  it('matches "third-party insurance required"', () => {
    const hit = tokenize('Third-party insurance is required for shipments over $25,000.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('third_party_insurance');
    expect(hit.conditionFragment.insuredValueLtDeclared).toBe(true);
  });

  it('matches "shipper must maintain cargo insurance"', () => {
    const hit = tokenize('The shipper must maintain separate cargo insurance coverage.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('third_party_insurance');
  });
});

// ── 8. Destination Restrictions ───────────────────────────────────────

describe('T1 tokenizer — destination restrictions', () => {
  it('matches "high-risk destination prohibited"', () => {
    const hit = tokenize('High-risk destinations are not permitted for uninsured shipments.');
    expectHit(hit);
    expect(hit.conditionFragment.destinationRiskTierIn).toContain('high');
  });

  it('matches "shipments to [country]"', () => {
    const hit = tokenize('International shipments to Canada must include customs documentation.');
    expectHit(hit);
    expect(hit.conditionFragment.destinationCountryIn).toContain('Canada');
  });
});

// ── 9. Packaging ──────────────────────────────────────────────────────

describe('T1 tokenizer — packaging', () => {
  it('matches "must be shipped in [package type]"', () => {
    const hit = tokenize('Fine art must be shipped in a wooden crate.');
    expectHit(hit);
    expect(hit.conditionFragment.packageTypeIn).toContain('wooden crate');
  });
});

// ── 10. Shipper Verticals ─────────────────────────────────────────────

describe('T1 tokenizer — shipper verticals', () => {
  it('matches "jewelry shipments"', () => {
    const hit = tokenize('Jewelry shipments require adult signature and full insurance.');
    expectHit(hit);
    expect(hit.conditionFragment.shipperVertical).toBe('jewelry');
  });

  it('matches "pharmaceutical shipments"', () => {
    const hit = tokenize('Pharmaceutical shipments must carry a temperature monitor.');
    expectHit(hit);
    expect(hit.conditionFragment.shipperVertical).toBe('pharma');
  });

  it('matches "fine art shipments"', () => {
    const hit = tokenize('Fine art shipments require independent appraisal.');
    expectHit(hit);
    expect(hit.conditionFragment.shipperVertical).toBe('fine_art');
  });

  it('matches "artwork shipments"', () => {
    const hit = tokenize('Artwork shipments must be crated and insured.');
    expectHit(hit);
    expect(hit.conditionFragment.shipperVertical).toBe('fine_art');
  });
});

// ── 11. Commodity Restrictions ────────────────────────────────────────

describe('T1 tokenizer — commodity restrictions', () => {
  it('matches "following commodities are excluded: X"', () => {
    const hit = tokenize('The following commodities are excluded: live animals, perishable food.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('commodity_excluded');
    expect(hit.conditionFragment.commodityIn).toContain('live animals, perishable food');
  });
});

// ── 12. Collision Resolution ──────────────────────────────────────────

describe('T1 tokenizer — collision resolution', () => {
  it('longer match wins over shorter match', () => {
    // "jewelry shipments" (short) vs "adult signature required for all jewelry shipments over $X" (longer)
    const hit = tokenize('Adult signature required for all jewelry shipments over $10,000.');
    expectHit(hit);
    // The "adult_signature_above_threshold" pattern matches a longer span
    // than "jewelry_shipments" — adult + amount wins
    expect(hit.ruleKey).toBe('signature_above_threshold');
    expect(hit.conditionFragment.signatureRequiredAbove).toBe(10000);
  });

  it('returns only the longest match, not all matches', () => {
    // Clause triggers both "signature required for all shipments over $X" and "adult signature required"
    // "signature required for all shipments over $5,000" is longer than "adult signature required"
    const hit = tokenize('Adult signature required for all shipments over $5,000.');
    expectHit(hit);
    expect(hit.ruleKey).toBe('signature_above_threshold');
  });
});

// ── 13. Null / Unmatched ──────────────────────────────────────────────

describe('T1 tokenizer — null returns', () => {
  it('returns null for random text', () => {
    expect(tokenize('This document is governed by the laws of the State of Delaware.')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(tokenize('')).toBeNull();
  });

  it('returns null for generic policy boilerplate', () => {
    expect(tokenize('All terms and conditions apply as stated in the master service agreement.')).toBeNull();
  });
});

// ── 14. tokenizeAll / tokenizeStats ───────────────────────────────────

describe('T1 tokenizer — tokenizeAll and tokenizeStats', () => {
  const clauses = [
    'The declared value shall not exceed $25,000 per shipment.',
    'Adult signature required for all shipments over $5,000.',
    'Certificate of insurance is required.',
    'This is a generic policy statement with no match.',
    'Temperature-controlled shipping is required for pharma.',
    'Another unmatched boilerplate clause.',
  ];

  it('tokenizeAll returns only matched clauses, sorted by confidence', () => {
    const hits = tokenizeAll(clauses);
    expect(hits.length).toBe(4);
    // First should be highest confidence
    expect(hits[0].confidence).toBeGreaterThanOrEqual(hits[1].confidence);
  });

  it('tokenizeStats returns correct counts and coverage', () => {
    const stats = tokenizeStats(clauses);
    expect(stats.total).toBe(6);
    expect(stats.matched).toBe(4);
    expect(stats.unmatched).toBe(2);
    expect(stats.coverage).toBeCloseTo(4 / 6);
  });

  it('tokenizeStats on empty array returns zero coverage', () => {
    const stats = tokenizeStats([]);
    expect(stats.total).toBe(0);
    expect(stats.coverage).toBe(0);
  });
});

// ── 15. Performance Benchmark ─────────────────────────────────────────

describe('T1 tokenizer — performance', () => {
  it('processes 100 clauses in under 500ms (<5ms each)', () => {
    const clauses = Array.from({ length: 100 }, (_, i) => {
      const bank = [
        'The declared value shall not exceed $25,000.00.',
        'Adult signature required.',
        'Temperature-controlled shipping is required.',
        'Certificate of insurance is required prior to tender.',
        'Fine art shipments must be shipped in a wooden crate.',
        'This is standard policy boilerplate with no pattern match.',
      ];
      return bank[i % bank.length];
    });

    const start = performance.now();
    const hits = tokenizeAll(clauses);
    const elapsed = performance.now() - start;

    // 100 clauses at <5ms each = <500ms total
    expect(elapsed).toBeLessThan(500);
    // Should still find matches
    expect(hits.length).toBeGreaterThan(0);
  });
});

// ── 16. Batch Execution — realistic document ──────────────────────────

describe('T1 tokenizer — realistic document batch', () => {
  it('processes a realistic policy document excerpt', () => {
    const policyExcerpt = [
      'The declared value shall not exceed $50,000.00 per shipment.',
      'Adult signature required for all shipments over $5,000.',
      'Indirect signature is permitted for shipments under $5,000.',
      'High-value shipments must be shipped via UPS.',
      'Fine art is not authorized for USPS shipments.',
      'Excluded carrier: FedEx Ground.',
      'Pharmaceutical shipments must use temperature-controlled shipping.',
      'All shipments must be insured for full declared value.',
      'Third-party insurance is required for shipments over $25,000.',
      'Certificate of insurance is required.',
      'An independent appraisal is required for fine art shipments.',
      'Fine art must be shipped in a wooden crate.',
      'High-risk destinations are not permitted.',
      'International shipments to Canada must comply with customs regulations.',
      'This agreement is governed by Delaware law.',
    ];

    const stats = tokenizeStats(policyExcerpt);
    // Rough expectation: 7-9 of 9 clauses should match (the "GENERAL" line may not)
    expect(stats.coverage).toBeGreaterThanOrEqual(0.55); // >50% coverage
    expect(stats.matched).toBeGreaterThanOrEqual(5);

    // Verify specific known matches
    const ruleKeys = stats.hits.map((h) => h.ruleKey);
    expect(ruleKeys).toContain('declared_value_limit');
    expect(ruleKeys).toContain('signature_type');
    expect(ruleKeys).toContain('signature_above_threshold');
    expect(ruleKeys).toContain('carrier_excluded');
    expect(ruleKeys).toContain('temperature_control');
    expect(ruleKeys).toContain('full_value_insurance');
    expect(ruleKeys).toContain('documentation_required');
    expect(ruleKeys).toContain('packaging_requirement');
  });
});
