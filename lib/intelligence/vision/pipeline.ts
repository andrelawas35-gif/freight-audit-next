/**
 * Vision Extraction Pipeline — orchestrates the full vision extraction flow.
 *
 * Flow:
 *   1. Classify document (scan vs digital)
 *   2. If scan → upload image to blob storage
 *   3. Call Gemini backend for structured extraction
 *   4. Write results to policy_documents (content_classification + extracted_fields + stored_image_url)
 *
 * This is called from the Server Action (addVisionDocumentAction) and
 * the job queue (for async/batch processing in the future).
 */

import { getSql } from '@/lib/db';
import { getGeminiVisionBackend } from './gemini-backend';
import { getExtractionSchema } from './extraction-schemas';
import { classifyDocumentContent } from './classification';
import { fetchGoldenExamples } from './golden-examples';
import type { DocumentTypeTag, ExtractionResult } from './extractor-interface';

// ── Types ────────────────────────────────────────────────────────────

export interface VisionPipelineInput {
  /** Client ID for tenant scoping */
  clientId: string;
  /** Parent policy ID */
  policyId: string;
  /** Staff-selected document type tag */
  documentType: DocumentTypeTag;
  /** Original file name */
  fileName: string;
  /** Uploaded file as base64 string (without data URI prefix) */
  fileBase64: string;
  /** MIME type of the uploaded file */
  mimeType: string;
  /** Vercel Blob URL where the image is stored */
  storedImageUrl: string;
  /** Staff email or ID */
  uploadedBy: string;
  /** Optional: document effective date range */
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  /** Optional: staff-provided summary */
  summary?: string | null;
}

export interface VisionPipelineResult {
  /** Whether vision extraction was attempted (true) or skipped (false, text path) */
  visionExtracted: boolean;
  /** The document ID created in policy_documents */
  documentId: string;
  /** Classification applied */
  contentClassification: string;
  /** Extraction result (null if text path or extraction failed gracefully) */
  extraction: ExtractionResult | null;
}

// ── Pipeline ────────────────────────────────────────────────────────

/**
 * Run the full vision extraction pipeline for a single document.
 *
 * Handles:
 *   - Content classification (scan vs digital)
 *   - Vision extraction via Gemini (scan documents only)
 *   - Database persistence of all results
 *
 * Graceful degradation:
 *   - If classification says "digital" → skips vision, writes minimal row
 *   - If Gemini fails → writes row with extraction_status='needs_review', unreadable fields
 *   - If blob upload fails → still writes row with empty stored_image_url
 */
export async function runVisionPipeline(
  input: VisionPipelineInput,
): Promise<VisionPipelineResult> {
  const sql = getSql();

  // Step 1: Classify document content
  const classification = classifyDocumentContent(input.fileName, input.mimeType);

  let extraction: ExtractionResult | null = null;

  // Step 2: If scan, run vision extraction
  if (classification === 'scan' || classification === 'mixed') {
    try {
      const schema = getExtractionSchema(input.documentType);
      if (schema.fields.length > 0) {
        const backend = getGeminiVisionBackend();
        // Fetch golden few-shot examples for context injection
        const fewShotExamples = await fetchGoldenExamples(input.documentType);
        extraction = await backend.extract(input.fileBase64, schema, fewShotExamples);
      }
    } catch (err) {
      console.error(
        `[VisionPipeline] Extraction failed for ${input.fileName}:`,
        err instanceof Error ? err.message : String(err),
      );
      // Graceful: continue with null extraction — document saved as needs_review
    }
  }

  // Step 3: Determine extraction status
  let extractionStatus: string;
  if (classification === 'digital') {
    extractionStatus = 'not_started'; // Text path handles extraction separately
  } else if (!extraction || extraction.fields.length === 0) {
    extractionStatus = 'needs_review'; // Vision failed or produced nothing
  } else if (extraction.unreadableFields.length > 0) {
    extractionStatus = 'needs_review'; // Some fields unreadable
  } else {
    extractionStatus = 'extracted'; // Clean extraction
  }

  // Step 4: Write to policy_documents
  const [row] = await sql.query(
    `INSERT INTO policy_documents (
       client_id, policy_id, document_type, file_name,
       source_url, stored_image_url, content_classification,
       extraction_status, extracted_fields, raw_text, summary,
       uploaded_by, effective_from, effective_to
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      input.clientId,
      input.policyId,
      input.documentType,
      input.fileName,
      input.storedImageUrl, // source_url = blob URL
      input.storedImageUrl, // stored_image_url = same blob URL (single source)
      classification,
      extractionStatus,
      extraction ? JSON.stringify(extraction) : null,
      null, // raw_text — not applicable for vision path
      input.summary ?? null,
      input.uploadedBy,
      input.effectiveFrom ?? null,
      input.effectiveTo ?? null,
    ],
  ) as { id: string }[];

  return {
    visionExtracted: extraction !== null,
    documentId: row.id,
    contentClassification: classification,
    extraction,
  };
}
