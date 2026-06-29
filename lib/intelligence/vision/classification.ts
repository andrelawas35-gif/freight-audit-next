/**
 * Document Content Classification — scan vs digital detection.
 *
 * Determines whether a document should be routed to the text extraction
 * path (T1 tokenizer → T2 LLM) or the vision extraction path (Gemini backend).
 *
 * Classification logic:
 *   1. Staff uploads a file (image or PDF)
 *   2. This module checks whether extractable text exists
 *   3. No extractable text → "scan" (routes to vision)
 *   4. Extractable text → "digital" (routes to existing text pipeline)
 *   5. Mixed pages → "mixed" (split per page — Phase 1.5+)
 *
 * Phase 1 implementation: simple file-type based heuristic.
 * Phase 1.5: PDF text extraction with pdf-parse for page-level splitting.
 */

// ── Types ────────────────────────────────────────────────────────────

/** Content classification for routing documents. */
export type ContentClassification = 'digital' | 'scan' | 'mixed';

/** Image file extensions that always route to vision (no text to extract). */
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.heic',
]);

/** PDF extensions — may contain text or be scanned images. */
const PDF_EXTENSIONS = new Set(['.pdf']);

/** Text-based extensions that route to the text path. */
const TEXT_EXTENSIONS = new Set([
  '.txt', '.csv', '.json', '.xml', '.html', '.htm', '.md',
  '.docx', '.doc', '.xlsx', '.xls',
]);

// ── Classification ───────────────────────────────────────────────────

/**
 * Classify a document as digital (text path), scan (vision path), or mixed.
 *
 * Phase 1: Simple file-extension heuristic.
 *   - Images → scan (always route to vision)
 *   - PDFs → scan (conservative — assume scanned until text extraction is proven)
 *   - Text files → digital
 *   - Unknown → scan (conservative — don't lose content to silent failure)
 *
 * Phase 1.5+ will add actual PDF text extraction for accurate classification.
 *
 * @param fileName - The uploaded file name (e.g., "acme_coi_2026.png")
 * @param mimeType - Optional MIME type from the upload
 * @returns Content classification for routing
 */
export function classifyDocumentContent(
  fileName: string,
  mimeType?: string,
): ContentClassification {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  if (!ext || ext === fileName) {
    // No extension — conservative: assume scan
    return 'scan';
  }

  if (IMAGE_EXTENSIONS.has(ext)) return 'scan';
  if (PDF_EXTENSIONS.has(ext)) {
    // Conservative: PDFs are assumed scanned until text extraction is attempted.
    // Phase 1.5: attempt text extraction here and reclassify.
    return 'scan';
  }
  if (TEXT_EXTENSIONS.has(ext)) return 'digital';

  // Unknown extension — conservative: assume scan
  return 'scan';
}

/**
 * Determine if a MIME type indicates an image.
 */
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Allowed MIME types for vision extraction upload.
 */
export const ALLOWED_VISION_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'application/pdf',
];

/**
 * Maximum file size for vision extraction upload (10 MB).
 * Prevents oversized images from consuming excessive memory/API costs.
 */
export const MAX_VISION_UPLOAD_BYTES = 10 * 1024 * 1024;
