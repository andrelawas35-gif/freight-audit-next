/**
 * Golden Example Data Access — few-shot context injection support.
 *
 * Grilling decisions (2026-06-28):
 *   - 3 golden examples per document type
 *   - Stored in policy_documents (is_golden_example = true)
 *   - image_base64 cached at promotion time
 *   - Static few-shot (not RAG) until 20+ examples
 */

import { getSql } from '@/lib/db';
import type { FewShotExample, DocumentTypeTag } from './extractor-interface';

/**
 * Fetch golden few-shot examples for a given document type.
 *
 * Returns up to 3 examples ordered by most recently promoted first.
 * Only returns examples where image_base64 is already cached.
 */
export async function fetchGoldenExamples(
  documentType: DocumentTypeTag,
): Promise<FewShotExample[]> {
  const sql = getSql();
  const rows = await sql.query(
    `SELECT id, image_base64, extracted_fields
     FROM policy_documents
     WHERE is_golden_example = true
       AND document_type = $1
       AND image_base64 IS NOT NULL
       AND extracted_fields IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 3`,
    [documentType],
  ) as Array<{ id: string; image_base64: string; extracted_fields: unknown }>;

  return rows.map((row) => ({
    imageBase64: row.image_base64,
    expectedJson: JSON.stringify(row.extracted_fields),
    sourceDocumentId: row.id,
  }));
}

/**
 * Promote a document to golden example status.
 *
 * Fetches the image from the blob URL, encodes to base64,
 * and updates the policy_documents row.
 *
 * Called from the promoteToGoldenExample Server Action.
 */
export async function promoteDocumentToGolden(
  documentId: string,
  storedImageUrl: string,
  extractedFields: Record<string, unknown>,
): Promise<void> {
  const sql = getSql();

  // Fetch the image from blob storage and encode to base64
  const imageBase64 = await fetchAndEncodeImage(storedImageUrl);

  await sql.query(
    `UPDATE policy_documents
     SET is_golden_example = true,
         image_base64 = $1
     WHERE id = $2`,
    [imageBase64, documentId],
  );
}

/**
 * Demote a golden example (remove from few-shot bank).
 */
export async function demoteGoldenExample(documentId: string): Promise<void> {
  const sql = getSql();
  await sql.query(
    `UPDATE policy_documents
     SET is_golden_example = false,
         image_base64 = NULL
     WHERE id = $1`,
    [documentId],
  );
}

/**
 * Count golden examples per document type.
 */
export async function countGoldenExamples(
  documentType: DocumentTypeTag,
): Promise<number> {
  const sql = getSql();
  const [row] = await sql.query(
    `SELECT COUNT(*)::int AS count
     FROM policy_documents
     WHERE is_golden_example = true
       AND document_type = $1`,
    [documentType],
  ) as Array<{ count: number }>;
  return row?.count ?? 0;
}

// ── Helpers ──────────────────────────────────────────────────────────

async function fetchAndEncodeImage(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from blob storage: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}
