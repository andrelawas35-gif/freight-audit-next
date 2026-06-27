/**
 * T2 LLM Data Mapper (ADR 0012 D3)
 * 
 * Maps unmatched clause text → PolicyCondition keys via LLM.
 * Strict schema alignment — LLM can only output existing PolicyCondition keys.
 * If no key fits → { mapped: false } → routes to T4 client ambiguity dashboard.
 *
 * Model chain: GPT-4o-mini → Claude Sonnet escalate → Claude Haiku fallback
 * Degrades silently when no API key configured → { mapped: false } for all clauses.
 */

import type { PolicyCondition, PolicyAction } from './policy-evaluator';

// ── Response Types ──────────────────────────────────────────────────

export type T2MappedResult = {
  mapped: true;
  ruleKey: string;
  conditionJson: PolicyCondition;
  confidence: number;
  modelUsed: string;
  reasoning: string;
};

export type T2UnmappedResult = {
  mapped: false;
  reason: string;
  modelUsed: string;
};

export type T2Result = T2MappedResult | T2UnmappedResult;

// ── Zod-like validation (no zod dependency at runtime) ──────────────

const VALID_CONDITION_KEYS = [
  'declaredValueGte', 'declaredValueGt', 'declaredValueLte',
  'insuredValueLtDeclared',
  'carrierIn', 'carrierNotIn',
  'serviceIn', 'serviceNotIn',
  'shipperVertical', 'commodityType', 'commodityIn',
  'destinationCountryIn', 'destinationZipIn', 'destinationRiskTierIn',
  'signatureRequiredAbove', 'signatureTypeIn',
  'documentationRequired', 'packageTypeIn',
  'temperatureControlRequired', 'temperatureMax',
];

function validateCondition(json: unknown): PolicyCondition | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;

  const obj = json as Record<string, unknown>;
  const condition: PolicyCondition = {};

  for (const key of Object.keys(obj)) {
    if (!VALID_CONDITION_KEYS.includes(key)) {
      console.warn('[T2] Rejected unknown key:', key);
      return null; // Unknown key — reject entire response
    }
    const val = obj[key];
    // Type-check values: arrays must contain strings; booleans are booleans; numbers are numbers
    if (key === 'temperatureControlRequired' || key === 'insuredValueLtDeclared') {
      if (typeof val !== 'boolean') return null;
    } else if (key.endsWith('In') || key === 'documentationRequired') {
      if (!Array.isArray(val) || !val.every(v => typeof v === 'string')) return null;
    } else if (key.includes('Value') || key.includes('Above') || key === 'temperatureMax') {
      if (typeof val !== 'number' || isNaN(val)) return null;
    } else if (key === 'shipperVertical') {
      if (typeof val !== 'string' && !(Array.isArray(val) && val.every(v => typeof v === 'string'))) return null;
    } else if (key === 'commodityType') {
      if (typeof val !== 'string') return null;
    }
    (condition as Record<string, unknown>)[key] = val;
  }

  return Object.keys(condition).length > 0 ? condition : null;
}

// ── Prompt Construction ─────────────────────────────────────────────

function buildPrompt(clauseText: string): string {
  return `You are a structured data mapper for freight insurance policy clauses.

TASK: Map the following policy clause to one or more fields from the PolicyCondition schema. Only use keys that directly apply to the clause's meaning. Leave irrelevant keys out — do NOT populate fields just because they exist.

CLAUSE: "${clauseText}"

SCHEMA (PolicyCondition — all fields optional, populate only what applies):
{
  // Declared value thresholds
  "declaredValueGte": number,          // min declared value (>=)
  "declaredValueGt": number,           // declared value above (>)
  "declaredValueLte": number,          // max declared value (<=)
  "insuredValueLtDeclared": boolean,   // under-insured (insured value < declared value)

  // Carrier constraints
  "carrierIn": string[],               // allowed carriers
  "carrierNotIn": string[],            // excluded carriers

  // Service level
  "serviceIn": string[],               // required service levels
  "serviceNotIn": string[],            // excluded service levels

  // Shipper / commodity
  "shipperVertical": string | string[], // e.g., "jewelry", "pharma", "fine_art"
  "commodityType": string,             // exact commodity type
  "commodityIn": string[],             // commodity list

  // Destination
  "destinationCountryIn": string[],     // allowed countries (2-letter codes)
  "destinationZipIn": string[],        // zip prefix constraints
  "destinationRiskTierIn": string[],   // "low", "medium", "high"

  // Signature
  "signatureRequiredAbove": number,    // signature threshold ($ amount)
  "signatureTypeIn": string[],         // ["adult", "direct", "indirect"]

  // Documentation & packaging
  "documentationRequired": string[],    // e.g., ["certificate_of_insurance", "appraisal"]
  "packageTypeIn": string[],           // required packaging types

  // Temperature control
  "temperatureControlRequired": boolean, // cold chain / temp control needed
  "temperatureMax": number              // maximum temperature (Fahrenheit)
}

RULES:
1. Only include keys the clause directly asserts. If the clause says "must use UPS", output carrierIn: ["UPS"]. Do NOT also set carrierNotIn.
2. Dollar amounts should be parsed as numbers (no $ sign, no commas). "$50,000" → 50000.
3. Carrier names should be normalized: "FedEx" not "FedEx Ground", "UPS" not "United Parcel Service".
4. If the clause mentions a threshold ("over $X", "above $X"), use declaredValueGt. If it mentions a cap ("not exceed $X", "maximum $X"), use declaredValueLte.
5. If the clause does NOT cleanly map to any key, respond with { "mapped": false, "reason": "..." }.

RESPOND WITH VALID JSON ONLY (no markdown, no explanation outside the JSON):
If mapped: { "mapped": true, "ruleKey": "category_key", "conditionJson": { ... }, "confidence": 0.0-1.0, "reasoning": "..." }
If unmapped: { "mapped": false, "reason": "..." }`;
}

// ── LLM Calls ───────────────────────────────────────────────────────

async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a precise data mapper. Respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 500,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(prompt: string, model: string = 'claude-sonnet-4-20250514'): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      temperature: 0,
      system: 'You are a precise data mapper. Respond with valid JSON only, no markdown, no explanation outside the JSON object.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.content[0].text;
}

function parseJSON(raw: string): T2Result | null {
  try {
    // Strip markdown fences if present
    const jsonStr = raw.replace(/```json\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    
    if (parsed.mapped === true) {
      const condition = validateCondition(parsed.conditionJson);
      if (!condition) {
        console.warn('[T2] Zod validation rejected — invalid condition shape:', JSON.stringify(parsed.conditionJson).slice(0, 200));
        return null; // Escalates
      }
      return {
        mapped: true,
        ruleKey: parsed.ruleKey || 'unknown',
        conditionJson: condition,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        modelUsed: 'unset', // Set by caller
        reasoning: parsed.reasoning || '',
      };
    }
    
    if (parsed.mapped === false) {
      return {
        mapped: false,
        reason: parsed.reason || 'No reason provided',
        modelUsed: 'unset',
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Classify a single unmatched clause via T2 LLM mapper.
 * Chain: GPT-4o-mini → Claude Sonnet → Claude Haiku → degraded
 * Returns { mapped: false } when all models unavailable or clause unmappable.
 */
export async function classifyClause(clauseText: string): Promise<T2Result> {
  const prompt = buildPrompt(clauseText);

  // Try GPT-4o-mini first
  if (process.env.OPENAI_API_KEY) {
    try {
      const raw = await callOpenAI(prompt);
      const result = parseJSON(raw);
      if (result) {
        result.modelUsed = 'gpt-4o-mini';
        return result;
      }
      console.warn('[T2] GPT-4o-mini response failed validation, escalating to Claude');
    } catch (err) {
      console.warn('[T2] GPT-4o-mini call failed:', err instanceof Error ? err.message : err);
    }
  }

  // Escalate to Claude Sonnet
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const raw = await callAnthropic(prompt, 'claude-sonnet-4-20250514');
      const result = parseJSON(raw);
      if (result) {
        result.modelUsed = 'claude-sonnet-4-20250514';
        return result;
      }
      console.warn('[T2] Claude Sonnet response failed validation, trying Haiku');
    } catch (err) {
      console.warn('[T2] Claude Sonnet call failed:', err instanceof Error ? err.message : err);
    }
  }

  // Fall back to Claude Haiku
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const raw = await callAnthropic(prompt, 'claude-3-5-haiku-20241022');
      const result = parseJSON(raw);
      if (result) {
        result.modelUsed = 'claude-3-5-haiku-20241022';
        return result;
      }
    } catch (err) {
      console.warn('[T2] Claude Haiku call failed:', err instanceof Error ? err.message : err);
    }
  }

  // All models degraded — clause is unmappable, route to T4
  return {
    mapped: false,
    reason: 'All classification models unavailable or unable to parse clause.',
    modelUsed: 'degraded',
  };
}
