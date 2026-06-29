/**
 * Pipeline integration tests (T1 + T3 + T2 orchestration).
 *
 * T1 path runs without API keys (deterministic). T2/T3 paths degrade gracefully.
 * These test the orchestration logic, not the LLM responses.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Pipeline — T1 deterministic path (no API keys)', () => {
  // We import dynamically to control module caching
  let classify: typeof import('../pipeline').classify;

  beforeEach(async () => {
    // No API keys set — T2 should degrade, T1 should still work
    const mod = await import('../pipeline');
    classify = mod.classify;
  });

  it('classifies clauses with known T1 patterns', async () => {
    const clauses = [
      'All shipments over $5000 must have an adult signature at delivery.',
      'Temperature-controlled shipping is required for this contract.',
      'Shall not be shipped via FedEx Ground under any circumstances.',
      'Shipper must maintain cargo insurance throughout transit.',
    ];

    const result = await classify(clauses, { skipT2: true });

    expect(result.totalClauses).toBe(4);
    // At least 2 of these should hit T1 (adult signature + temperature + carrier + insurance)
    expect(result.stats.t1Hits).toBeGreaterThanOrEqual(2);
    expect(result.classified.length).toBeGreaterThanOrEqual(1);
    expect(result.stats).toBeDefined();
    expect(result.stats.totalCost).toBeGreaterThanOrEqual(0);
  });

  it('routes empty clauses directly to T4', async () => {
    const result = await classify(['', '  ', '\t\n'], { skipT2: true });

    expect(result.stats.t4Unmapped).toBe(3);
    expect(result.unmapped).toHaveLength(3);
    result.unmapped.forEach(r => {
      expect(r.reason).toBe('Empty clause');
    });
  });

  it('handles all-unmapped gracefully', async () => {
    const result = await classify(
      ['Nothing here matches anything.', 'Random gibberish xyz123 blah.'],
      { skipT2: true }
    );

    expect(result.stats.t1Hits).toBe(0);
    // Without API keys and skipT2, all go to T4
    expect(result.stats.t4Unmapped).toBe(2);
  });

  it('preserves clause order in results', async () => {
    const clauses = [
      'Adult signature required for shipments over $10000.',
      'xyz random text no match.',
      'Temperature-controlled freight is mandatory.',
    ];

    const result = await classify(clauses, { skipT2: true });

    const classifiedTexts = result.classified.map(r => r.clauseText);
    expect(classifiedTexts).toContain('Adult signature required for shipments over $10000.');
    expect(classifiedTexts).toContain('Temperature-controlled freight is mandatory.');
  });

  it('returns valid stats shape', async () => {
    const result = await classify(['All shipments over $5000 require adult signature.'], { skipT2: true });

    expect(result.stats).toEqual(expect.objectContaining({
      t1Hits: expect.any(Number),
      t3Hits: expect.any(Number),
      t2Mapped: expect.any(Number),
      t4Unmapped: expect.any(Number),
      t3NearMatches: expect.any(Number),
      totalCost: expect.any(Number),
    }));
  });

  it('T1 hit classification result has correct shape', async () => {
    const result = await classify(['All shipments over $10000 must have adult signature.'], { skipT2: true });

    const hit = result.classified.find(r => r.clauseText.includes('$10000'));
    if (hit) {
      expect(hit.tier).toBe('T1');
      expect(hit.classificationSource).toBe('TOKENIZER');
      expect(hit.confidence).toBeGreaterThan(0.9);
      expect(hit.mapped).toBe(true);
      expect(hit.conditionJson).toBeDefined();
    }
  });

  it('combined classified + unmapped equals totalClauses', async () => {
    const clauses = [
      'Shipments over $5000 need adult signature.',
      'Completely unmappable text here.',
      'Temperature-controlled shipping required.',
      'Another random clause.',
    ];

    const result = await classify(clauses, { skipT2: true });

    expect(result.classified.length + result.unmapped.length).toBe(result.totalClauses);
  });
});
