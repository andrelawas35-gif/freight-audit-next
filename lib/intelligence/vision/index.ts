/**
 * AI Vision Extraction Engine — barrel export.
 *
 * Import from '@/lib/intelligence/vision' to access:
 *   - VisionExtractor interface + types
 *   - GeminiVisionBackend (Phase 1 production)
 *   - Extraction schemas per document type
 *   - Classification utilities
 */

// Core interface + types
export {
  type VisionExtractor,
  type ExtractionResult,
  type ExtractionSchema,
  type ExtractionFieldDef,
  type ExtractedField,
  type DocumentTypeTag,
  type FieldCriticality,
  type ConfidenceThresholds,
  classifyConfidence,
  DEFAULT_CONFIDENCE_THRESHOLDS,
} from './extractor-interface';

// Gemini backend (Phase 1 production)
export { GeminiVisionBackend, getGeminiVisionBackend } from './gemini-backend';

// Extraction schemas
export {
  COI_EXTRACTION_SCHEMA,
  BOL_EXTRACTION_SCHEMA,
  DELIVERY_RECEIPT_SCHEMA,
  EXTRACTION_SCHEMAS,
  getExtractionSchema,
} from './extraction-schemas';

// Document classification (scan vs digital)
export {
  classifyDocumentContent,
  isImageMimeType,
  ALLOWED_VISION_MIME_TYPES,
  MAX_VISION_UPLOAD_BYTES,
  type ContentClassification,
} from './classification';

// Vision pipeline orchestrator
export {
  runVisionPipeline,
  type VisionPipelineInput,
  type VisionPipelineResult,
} from './pipeline';

// Golden examples (few-shot context injection)
export {
  fetchGoldenExamples,
  promoteDocumentToGolden,
  demoteGoldenExample,
  countGoldenExamples,
} from './golden-examples';
