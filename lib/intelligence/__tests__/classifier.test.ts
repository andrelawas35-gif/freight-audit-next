/**
 * T2 Classifier unit tests (mock-based, no real LLM calls).
 *
 * Tests prompt construction, response parsing, validation,
 * and model chain escalation logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock fetch so no real API calls ─────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetch(responseBody: object, status = 200) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────

describe('T2 Classifier — prompt construction', () => {
  // We can test the prompt builder indirectly by verifying classifyClause behavior
  // But first, test parseJSON validation logic directly via a helper

  it('accepts valid PolicyCondition JSON', async () => {
    mockFetch({
      choices: [{
        message: {
          content: JSON.stringify({
            mapped: true,
            ruleKey: 'declared_value_above_10000',
            conditionJson: { declaredValueGt: 10000, signatureRequiredAbove: 10000 },
            confidence: 0.95,
            reasoning: 'Clause sets a declared value threshold with signature requirement.',
          }),
        },
      }],
    });

    process.env.OPENAI_API_KEY = 'test-key';
    const { classifyClause } = await import('../classifier');
    const result = await classifyClause('Shipments over $10000 require signature.');
    delete process.env.OPENAI_API_KEY;

    expect(result.mapped).toBe(true);
    if (result.mapped) {
      expect(result.ruleKey).toBe('declared_value_above_10000');
      expect(result.conditionJson.declaredValueGt).toBe(10000);
      expect(result.conditionJson.signatureRequiredAbove).toBe(10000);
      expect(result.confidence).toBe(0.95);
    }
  });

  it('rejects condition JSON with unknown keys', async () => {
    mockFetch({
      choices: [{
        message: {
          content: JSON.stringify({
            mapped: true,
            ruleKey: 'bad_key',
            conditionJson: { notARealKey: 'value' },
            confidence: 0.8,
            reasoning: 'none',
          }),
        },
      }],
    });

    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { classifyClause } = await import('../classifier');
    const result = await classifyClause('Some clause.');
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    // Should escalate to Claude (also mock), then degrade
    expect(result.mapped).toBe(false);
  });

  it('handles unmapped response', async () => {
    mockFetch({
      choices: [{
        message: {
          content: JSON.stringify({
            mapped: false,
            reason: 'Clause is procedural, not a rule condition.',
          }),
        },
      }],
    });

    process.env.OPENAI_API_KEY = 'test-key';
    const { classifyClause } = await import('../classifier');
    const result = await classifyClause('The parties agree to meet quarterly.');
    delete process.env.OPENAI_API_KEY;

    expect(result.mapped).toBe(false);
    if (!result.mapped) {
      expect(result.reason).toContain('procedural');
    }
  });

  it('handles malformed JSON gracefully', async () => {
    mockFetch({
      choices: [{
        message: {
          content: 'not json at all {{{',
        },
      }],
    });

    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { classifyClause } = await import('../classifier');
    const result = await classifyClause('Some clause.');
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    // Should degrade after both models fail
    expect(result.mapped).toBe(false);
  });

  it('degrades silently when no API keys configured', async () => {
    const { classifyClause } = await import('../classifier');
    const result = await classifyClause('Any clause text here.');

    expect(result.mapped).toBe(false);
    expect(result.modelUsed).toBe('degraded');
  });

  it('parses dollar amounts as numbers', async () => {
    mockFetch({
      choices: [{
        message: {
          content: JSON.stringify({
            mapped: true,
            ruleKey: 'declared_value_limit',
            conditionJson: { declaredValueLte: 50000 },
            confidence: 0.92,
            reasoning: 'Maximum declared value of $50,000 specified.',
          }),
        },
      }],
    });

    process.env.OPENAI_API_KEY = 'test-key';
    const { classifyClause } = await import('../classifier');
    const result = await classifyClause('Maximum declared value is $50,000.');
    delete process.env.OPENAI_API_KEY;

    expect(result.mapped).toBe(true);
    if (result.mapped) {
      expect(result.conditionJson.declaredValueLte).toBe(50000);
    }
  });

  it('validates boolean fields correctly', async () => {
    mockFetch({
      choices: [{
        message: {
          content: JSON.stringify({
            mapped: true,
            ruleKey: 'temp_control_required',
            conditionJson: { temperatureControlRequired: true },
            confidence: 0.98,
            reasoning: 'Clause requires temperature-controlled shipping.',
          }),
        },
      }],
    });

    process.env.OPENAI_API_KEY = 'test-key';
    const { classifyClause } = await import('../classifier');
    const result = await classifyClause('Temperature-controlled shipping is required.');
    delete process.env.OPENAI_API_KEY;

    expect(result.mapped).toBe(true);
    if (result.mapped) {
      expect(result.conditionJson.temperatureControlRequired).toBe(true);
    }
  });

  it('validates array fields correctly', async () => {
    mockFetch({
      choices: [{
        message: {
          content: JSON.stringify({
            mapped: true,
            ruleKey: 'carrier_allowlist',
            conditionJson: { carrierIn: ['UPS', 'FedEx'] },
            confidence: 0.93,
            reasoning: 'Only UPS and FedEx allowed.',
          }),
        },
      }],
    });

    process.env.OPENAI_API_KEY = 'test-key';
    const { classifyClause } = await import('../classifier');
    const result = await classifyClause('Only UPS and FedEx may be used.');
    delete process.env.OPENAI_API_KEY;

    expect(result.mapped).toBe(true);
    if (result.mapped) {
      expect(result.conditionJson.carrierIn).toEqual(['UPS', 'FedEx']);
    }
  });

  it('strips markdown fences from response', async () => {
    mockFetch({
      choices: [{
        message: {
          content: '```json\n{"mapped":true,"ruleKey":"test","conditionJson":{"declaredValueGt":5000},"confidence":0.9,"reasoning":"ok"}\n```',
        },
      }],
    });

    process.env.OPENAI_API_KEY = 'test-key';
    const { classifyClause } = await import('../classifier');
    const result = await classifyClause('Over $5000.');
    delete process.env.OPENAI_API_KEY;

    expect(result.mapped).toBe(true);
  });

  it('escalates to DeepSeek-V3 when GPT-4o-mini fails, then degrades without DEEPSEEK_API_KEY', async () => {
    // First call (GPT-4o-mini) returns malformed JSON → escalates
    // Second call (DeepSeek) has no key set → skips
    // Third call (Claude Haiku) also mocked to fail → degrades
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: callCount === 1, // Only GPT-4o-mini "succeeds" with bad data
        status: callCount === 1 ? 200 : 500,
        json: async () => (callCount === 1
          ? { choices: [{ message: { content: 'not json' } }] }
          : { error: 'server error' }),
        text: async () => 'server error',
      });
    });

    process.env.OPENAI_API_KEY = 'test-key';
    process.env.ANTHROPIC_API_KEY = 'test-key';
    // No DEEPSEEK_API_KEY set — should skip DeepSeek, try Claude, then degrade
    const { classifyClause } = await import('../classifier');
    const result = await classifyClause('Some clause.');
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    expect(result.mapped).toBe(false);
    expect(result.modelUsed).toBe('degraded');
  });
});
