/**
 * Gemini Vision Backend — Phase 1 production extraction.
 *
 * Calls Gemini 3.1 Pro via the Gemini REST API (generativelanguage.googleapis.com)
 * with a multimodal prompt (image + extraction schema → structured JSON).
 *
 * Design decisions (grilling session 2026-06-28):
 *   - Direct HTTP (not the shared LLM client) — YAGNI, self-contained
 *   - Single model (Gemini 3.1 Pro) — no Flash escalation at current volume
 *   - Schema-driven extraction per document type
 *
 * Requires: GEMINI_API_KEY in .env.local
 */

import type { VisionExtractor, ExtractionResult, ExtractedField, FewShotExample } from './extractor-interface';
import type { ExtractionSchema } from './extractor-interface';
import { classifyConfidence, DEFAULT_CONFIDENCE_THRESHOLDS } from './extractor-interface';

// ── Configuration ────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = 'gemini-2.5-pro-exp-03-25'; // Gemini 2.5 Pro (experimental) — update when 3.1 Pro GA
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds — generous for vision extraction
const MAX_RETRIES = 2;

// ── Prompt Building ──────────────────────────────────────────────────

/**
 * Build a Gemini-compatible multimodal prompt from an image and extraction schema.
 *
 * Gemini uses a `parts` array with `inline_data` for images and `text` for prompts.
 * The system instruction is passed via `systemInstruction`, not as a message role.
 *
 * Few-shot context injection: when `fewShotExamples` are provided, they are prepended
 * to the `contents` array as alternating user/model role entries. Each example shows
 * the model what a correct extraction looks like before the real extraction is requested.
 *
 * Gemini few-shot format:
 *   [user: example image + "Extract fields..."] → [model: { "fields": [...] }]
 *   [user: example image + "Extract fields..."] → [model: { "fields": [...] }]
 *   [user: REAL image + "Extract fields..."] → [model: generates JSON]
 */
function buildGeminiRequest(
  imageBase64: string,
  schema: ExtractionSchema,
  fewShotExamples?: FewShotExample[],
) {
  const fieldList = schema.fields
    .map((f) => `- "${f.key}": ${f.description}`)
    .join('\n');

  const systemInstruction = {
    parts: [
      {
        text: `You are a freight document extraction specialist. Extract structured data from freight and compliance documents with high accuracy. Return ONLY valid JSON — no markdown, no commentary, no code fences.

Rules:
1. Return a JSON object with exactly the fields listed below.
2. If a field is not visible in the image, set its value to null.
3. For numeric values (currency, counts), extract as plain numbers without formatting (e.g., 1000000 not "$1,000,000").
4. For dates, use YYYY-MM-DD format.
5. For names, preserve exact spelling and capitalization as shown.
6. Include a "confidence" field (0.0-1.0) for EACH field reflecting how certain you are the extraction is correct.
   - 0.95+ = clearly legible, unambiguous
   - 0.85-0.94 = readable but slightly unclear (e.g., small text, light print)
   - 0.70-0.84 = partially legible (e.g., handwriting, faint stamp, partial obstruction)
   - 0.50-0.69 = mostly illegible but you can make an educated guess
   - <0.50 = genuinely unreadable — return null for the value
7. The examples above show EXACTLY the desired output format and field names — match them precisely.`,
      },
    ],
  };

  const userPrompt = `Extract the following fields from this ${schema.documentType} document image:

${fieldList}

Return JSON only. Format:
{
  "fields": [
    { "key": "field_name", "value": "extracted value or null", "confidence": 0.95 }
  ]
}`;

  // Build contents array — prepend few-shot examples before the real request
  const contents: Array<{ role?: string; parts: Array<Record<string, unknown>> }> = [];

  if (fewShotExamples && fewShotExamples.length > 0) {
    for (const example of fewShotExamples) {
      // User turn: show the example image + ask for extraction
      contents.push({
        role: 'user',
        parts: [
          { text: userPrompt },
          {
            inlineData: {
              mimeType: 'image/png',
              data: example.imageBase64,
            },
          },
        ],
      });
      // Model turn: show the expected JSON output
      contents.push({
        role: 'model',
        parts: [{ text: example.expectedJson }],
      });
    }
  }

  // Real request (no explicit role — defaults to user in Gemini API)
  contents.push({
    parts: [
      { text: userPrompt },
      {
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64,
        },
      },
    ],
  });

  return {
    systemInstruction,
    contents,
    generationConfig: {
      temperature: 0, // deterministic extraction
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  };
}

// ── Response Parsing ─────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface GeminiExtractedField {
  key: string;
  value: string | null;
  confidence: number;
}

function parseGeminiResponse(
  data: GeminiResponse,
  schema: ExtractionSchema,
  latencyMs: number,
): ExtractionResult {
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return {
      fields: [],
      modelId: GEMINI_MODEL,
      latencyMs,
      unreadableFields: schema.fields.map((f) => f.key),
      costEstimate: estimateCost(data),
    };
  }

  // Parse JSON — Gemini may wrap in markdown code fences
  let parsed: { fields?: GeminiExtractedField[] } | null = null;
  try {
    // Try direct parse first
    parsed = JSON.parse(text) as { fields?: GeminiExtractedField[] };
  } catch {
    // Try stripping markdown code fences
    const stripped = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    try {
      parsed = JSON.parse(stripped) as { fields?: GeminiExtractedField[] };
    } catch {
      // Complete parse failure — all fields unreadable
      return {
        fields: [],
        modelId: GEMINI_MODEL,
        latencyMs,
        unreadableFields: schema.fields.map((f) => f.key),
        costEstimate: estimateCost(data),
      };
    }
  }

  const rawFields = parsed?.fields ?? [];
  const extracted: ExtractedField[] = [];
  const unreadable: string[] = [];

  // Map extracted fields, classify confidence
  for (const field of schema.fields) {
    const found = rawFields.find((f) => f.key === field.key);
    if (!found || found.value === null || found.value === undefined) {
      unreadable.push(field.key);
      continue;
    }

    const confidence = clamp(found.confidence ?? 0, 0, 1);
    const classification = classifyConfidence(confidence);

    if (classification === 'unreadable') {
      unreadable.push(field.key);
    } else {
      extracted.push({
        key: field.key,
        value: String(found.value),
        confidence,
      });
    }
  }

  return {
    fields: extracted,
    modelId: GEMINI_MODEL,
    latencyMs,
    unreadableFields: unreadable,
    costEstimate: estimateCost(data),
  };
}

// ── Cost Estimation ──────────────────────────────────────────────────

/**
 * Estimate cost based on token usage.
 * Gemini 2.5 Pro pricing: ~$1.25/1M input tokens, ~$10/1M output tokens.
 * These are approximate — update when 3.1 Pro pricing is announced.
 */
function estimateCost(data: GeminiResponse): number {
  const input = data.usageMetadata?.promptTokenCount ?? 0;
  const output = data.usageMetadata?.candidatesTokenCount ?? 0;
  return (input * 1.25 + output * 10) / 1_000_000;
}

// ── Helpers ──────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Gemini Vision Backend ────────────────────────────────────────────

export class GeminiVisionBackend implements VisionExtractor {
  readonly modelId = GEMINI_MODEL;

  async extract(
    imageBase64: string,
    schema: ExtractionSchema,
    fewShotExamples?: FewShotExample[],
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    if (!GEMINI_API_KEY) {
      console.warn('[GeminiVisionBackend] GEMINI_API_KEY not set — returning empty result');
      return {
        fields: [],
        modelId: GEMINI_MODEL,
        latencyMs: 0,
        unreadableFields: schema.fields.map((f) => f.key),
        costEstimate: 0,
      };
    }

    const body = buildGeminiRequest(imageBase64, schema, fewShotExamples);
    const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          throw new Error(`Gemini API error ${response.status}: ${errorText.slice(0, 200)}`);
        }

        const data = (await response.json()) as GeminiResponse;
        const latencyMs = Date.now() - startTime;

        return parseGeminiResponse(data, schema, latencyMs);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(
          `[GeminiVisionBackend] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
          lastError.message,
        );

        if (attempt < MAX_RETRIES) {
          // Exponential backoff: 1s → 2s
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    // All retries exhausted — return empty result, don't crash
    console.error('[GeminiVisionBackend] All retries exhausted:', lastError?.message);
    return {
      fields: [],
      modelId: GEMINI_MODEL,
      latencyMs: Date.now() - startTime,
      unreadableFields: schema.fields.map((f) => f.key),
      costEstimate: 0,
    };
  }
}

/** Singleton instance — create once, reuse. */
let _geminiBackend: GeminiVisionBackend | null = null;

export function getGeminiVisionBackend(): GeminiVisionBackend {
  if (!_geminiBackend) {
    _geminiBackend = new GeminiVisionBackend();
  }
  return _geminiBackend;
}
