/*
  lib/disputes/response-parser.ts — Carrier Response Parser agent (suggest-only).

  Reads a carrier's unstructured reply to a billing dispute and classifies the
  outcome (won / partial / denied / escalated / unclear) plus the credited
  amount. A human reviews and confirms before it's applied — and the confirmed
  outcome is recorded as a label for the learning loop.

  Cost-optimized: uses Claude Haiku 4.5 (short emails, tiny structured output).
  No-ops without ANTHROPIC_API_KEY.
*/

import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

export function parserEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export type DisputeOutcome = 'won' | 'partial' | 'denied' | 'escalated' | 'unclear';

export type ParsedOutcome = {
  outcome: DisputeOutcome;
  recoveryAmount: number | null;
  confidence: number;
  reasoning: string;
};

export async function parseCarrierResponse(input: {
  emailText: string;
  disputedAmount?: number | null;
  carrier?: string | null;
}): Promise<ParsedOutcome | null> {
  const client = getClient();
  if (!client) return null;

  const schema = {
    type: 'object',
    properties: {
      outcome: { type: 'string', enum: ['won', 'partial', 'denied', 'escalated', 'unclear'] },
      recoveryAmount: { type: ['number', 'null'] },
      confidence: { type: 'integer' },
      reasoning: { type: 'string' },
    },
    required: ['outcome', 'recoveryAmount', 'confidence', 'reasoning'],
    additionalProperties: false,
  } as const;

  const system =
    `You read a freight carrier's reply to a billing dispute and classify the outcome. ` +
    `Definitions: "won" = full credit/refund approved; "partial" = a partial credit approved (less than disputed); ` +
    `"denied" = claim rejected; "escalated" = carrier needs more info or routed for further review (not resolved); ` +
    `"unclear" = cannot determine from the text. Extract the credited/refunded dollar amount if stated ` +
    `(recoveryAmount), otherwise null. Give a confidence 0-100 and one short sentence of reasoning.`;

  const user =
    `Disputed amount: ${input.disputedAmount != null ? '$' + input.disputedAmount : 'unknown'}\n` +
    `Carrier: ${input.carrier ?? 'unknown'}\n\n` +
    `Carrier reply:\n"""\n${input.emailText.slice(0, 8000)}\n"""`;

  try {
    const res = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema } },
    });

    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
    if (!text) return null;

    const p = JSON.parse(text) as Partial<ParsedOutcome>;
    if (!p.outcome) return null;

    const confidence = Math.max(0, Math.min(100, Math.round(Number(p.confidence) || 0)));
    const amt = p.recoveryAmount == null ? null : Number(p.recoveryAmount);
    return {
      outcome: p.outcome as DisputeOutcome,
      recoveryAmount: amt == null || isNaN(amt) ? null : amt,
      confidence,
      reasoning: String(p.reasoning ?? ''),
    };
  } catch (err) {
    console.error('[response-parser] failed:', err);
    return null;
  }
}
