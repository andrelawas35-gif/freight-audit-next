/**
 * AI Vision Extraction Engine — Core Types
 *
 * Defines the single VisionExtractor interface that abstracts all vision model
 * backends (Gemini 3.1 Pro today, fine-tuned Qwen2-VL later).
 *
 * The pipeline calls the interface, not the model. This enables:
 *   - Hot-swap backends via feature flag
 *   - Shadow mode (both models run, outputs compared)
 *   - Gradual cutover per document type
 *   - Fallback (low confidence → escalation model)
 */

// ── Extraction Result Types ──────────────────────────────────────────

/** One field extracted from a document image. */
export interface ExtractedField {
  /** Machine key, e.g. "policy_number", "coverage_limit" */
  key: string;
  /** Extracted value as a string (even numeric values) */
  value: string;
  /** Model confidence 0.0–1.0 */
  confidence: number;
}

/** A golden few-shot example: known-correct (image, JSON) pair for context injection. */
export interface FewShotExample {
  /** Base64-encoded image (without data URI prefix) */
  imageBase64: string;
  /** Expected JSON output for this image */
  expectedJson: string;
  /** Which document this example came from (audit trail) */
  sourceDocumentId: string;
}

/** Document type tag set by the Classification node (staff-selected). */
export type DocumentTypeTag = 'COI' | 'BOL' | 'delivery_receipt' | 'unknown';

/** Criticality: 3 = coverage-voiding if wrong, 2 = material, 1 = informational. */
export type FieldCriticality = 1 | 2 | 3;

/** Defines what fields to extract for a given document type. */
export interface ExtractionSchema {
  documentType: DocumentTypeTag;
  fields: ExtractionFieldDef[];
}

/** Single field definition in an extraction schema. */
export interface ExtractionFieldDef {
  key: string;
  description: string;
  criticality: FieldCriticality;
}

/** Result of a vision extraction call. */
export interface ExtractionResult {
  fields: ExtractedField[];
  /** Which model produced this (audit trail) */
  modelId: string;
  /** Round-trip latency in milliseconds */
  latencyMs: number;
  /** Fields whose confidence fell below the unreadable threshold */
  unreadableFields: string[];
  /** Estimated API cost in USD, null for self-hosted models */
  costEstimate: number | null;
}

// ── Vision Extractor Interface ───────────────────────────────────────

/**
 * Single interface for all vision extraction backends.
 *
 * Implementations:
 *   - GeminiVisionBackend  (Phase 1, production)
 *   - QwenVisionBackend    (Phase 2, fine-tuned, shadow → production)
 *
 * The pipeline calls extract() with a base64-encoded image
 * and a document-type-specific field schema. The backend
 * handles model invocation, response parsing, and confidence
 * scoring internally.
 */
export interface VisionExtractor {
  /**
   * Extract structured fields from a document image.
   *
   * @param imageBase64 - Base64-encoded image (without data URI prefix)
   * @param schema - Document-type-specific field schema
   * @param fewShotExamples - Optional golden example (image, JSON) pairs for context injection
   * @returns Structured extraction result with per-field confidence
   */
  extract(
    imageBase64: string,
    schema: ExtractionSchema,
    fewShotExamples?: FewShotExample[],
  ): Promise<ExtractionResult>;
}

// ── Confidence Thresholds ────────────────────────────────────────────

/**
 * Per-field confidence thresholds for routing extracted fields.
 *
 * At inference time:
 *   confidence ≥ suggest    → normal human review
 *   confidence < suggest    → human review with "low confidence" flag
 *     but ≥ unreadable
 *   confidence < unreadable → skip human review, mark unreadable
 *
 * These are empirically calibrated from a held-out test set.
 * Initial values are conservative defaults (Gemini 3.1 Pro on COIs).
 * Recalibrate after fine-tuning (Phase 2).
 */
export interface ConfidenceThresholds {
  /** Fields at or above this go to normal review */
  suggest: number;
  /** Fields below this skip human review entirely */
  unreadable: number;
}

/** Default thresholds — conservative for Gemini 3.1 Pro on freight documents. */
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  suggest: 0.85,
  unreadable: 0.50,
};

/**
 * Classify a per-field confidence score into a routing decision.
 */
export function classifyConfidence(
  confidence: number,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): 'normal' | 'low' | 'unreadable' {
  if (confidence >= thresholds.suggest) return 'normal';
  if (confidence >= thresholds.unreadable) return 'low';
  return 'unreadable';
}
