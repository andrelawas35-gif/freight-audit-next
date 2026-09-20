/*
  lib/ingestion/data-clerk.ts — Phase 2: the AI "Data Clerk" (suggest-only).

  When an unknown carrier code lands in the exceptions queue, the Data Clerk
  proposes the standard mapping + a confidence score + one-line reasoning, which
  pre-fills the analyst's form. It NEVER auto-commits — a human still approves
  (see the HITL design notes). Suggestions only run when ANTHROPIC_API_KEY is
  set; otherwise this no-ops and analysts map manually.

  Uses the official Anthropic SDK with structured outputs (guaranteed-valid JSON).
*/

import Anthropic from '@anthropic-ai/sdk';
import { STANDARD_ACCESSORIALS } from './accessorial-map';
import {
  listExceptions, loadLearnedMappings,
  type MappingType, type LearnedMapping,
} from './mappings';
import { proposeMapping } from './code-mapping';

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic();
  return _client;
}

export function clerkEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export type ClerkSuggestion = { standardCode: string; confidence: number; reasoning: string };

export async function suggestMapping(input: {
  mappingType: MappingType;
  carrierScac: string | null;
  rawCode: string;
  examples?: LearnedMapping[];
}): Promise<ClerkSuggestion | null> {
  const client = getClient();
  if (!client) return null;

  const isAccessorial = input.mappingType === 'accessorial';

  const schema = {
    type: 'object',
    properties: {
      standardCode: isAccessorial
        ? { type: 'string', enum: STANDARD_ACCESSORIALS }
        : { type: 'string' },
      confidence: { type: 'integer' }, // 0-100; clamped after (numeric bounds unsupported in schema)
      reasoning: { type: 'string' },
    },
    required: ['standardCode', 'confidence', 'reasoning'],
    additionalProperties: false,
  } as const;

  const allowed = isAccessorial
    ? `Choose exactly one of these standard accessorial codes: ${STANDARD_ACCESSORIALS.join(', ')}.`
    : 'Return the standard human-readable service level label, e.g. "Ground", "2-Day", "Next Day Air", "LTL Guaranteed".';

  const examples = (input.examples ?? [])
    .filter((e) => e.mapping_type === input.mappingType)
    .slice(0, 25)
    .map((e) => `${e.carrier_scac ?? 'ANY'} ${e.raw_code} -> ${e.standard_code}`)
    .join('\n');

  const system =
    `You are a freight-bill data normalization assistant (a "Data Clerk"). Map a carrier's raw ` +
    `${isAccessorial ? 'accessorial charge code' : 'service-level code'} to the company's standard ` +
    `${isAccessorial ? 'accessorial code' : 'service level'}, using well-known freight industry conventions ` +
    `for the given carrier. Be conservative: if you are unsure, pick the closest match and lower your confidence (0-100). ` +
    `Give one short sentence of reasoning.`;

  const user =
    `Carrier SCAC: ${input.carrierScac ?? 'unknown'}\n` +
    `Raw code: ${input.rawCode}\n${allowed}` +
    (examples ? `\n\nExisting approved mappings for reference:\n${examples}` : '');

  try {
    const res = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema } },
    });

    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as Partial<ClerkSuggestion>;
    if (!parsed.standardCode) return null;

    const confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0)));
    return {
      standardCode: String(parsed.standardCode),
      confidence,
      reasoning: String(parsed.reasoning ?? ''),
    };
  } catch (err) {
    console.error('[data-clerk] suggestion failed:', err);
    return null;
  }
}

// Best-effort: annotate open exceptions that don't yet have a suggestion.
// Safe to call from the ingest path — no-ops without an API key, never throws.
export async function annotateOpenExceptions(limit = 20): Promise<number> {
  if (!clerkEnabled()) return 0;
  let learned: LearnedMapping[] = [];
  try {
    learned = await loadLearnedMappings();
  } catch {
    /* ignore */
  }

  let annotated = 0;
  try {
    const open = await listExceptions('open', limit);
    for (const exc of open) {
      if (exc.suggested_code) continue;
      const s = await suggestMapping({
        mappingType: exc.mapping_type,
        carrierScac: exc.carrier_scac,
        rawCode: exc.raw_code,
        examples: learned,
      });
      if (s) {
        await proposeMapping(exc.id, s.standardCode, s.reasoning, s.confidence);
        annotated++;
      }
    }
  } catch (err) {
    console.error('[data-clerk] annotateOpenExceptions failed:', err);
  }
  return annotated;
}
