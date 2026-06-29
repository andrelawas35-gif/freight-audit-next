# AI Extraction Engine — Implementation Plan

> Derived from grilling sessions: [`10-ai-extraction-engine.md`](10-ai-extraction-engine.md) (34+6 decisions, 2026-06-28).
> This is the executable build plan. The exploration doc is the *why*; this is the *how*.
>
> **Phase 1:** ✅ Deployed — Gemini vision extraction with schema injection.
> **Phase 2:** ✅ Deployed — Context injection (few-shot) with golden example bank.
> **Phase 3:** ⬜ Per-document-type assessment — when enough real documents accumulate.
> **Fine-tuning:** ⏸️ On standby — 1,000 synthetic COIs in `training/coi_train.jsonl`.

## Dependency chain

```
Phase 1 (foundation) ──► Phase 2 (context injection) ──► Phase 3 (assessment)
      │                           │                             │
      │  Built first              │  Depends on Phase 1         │  Depends on Phase 2
      │  Gemini 3.1 Pro backend   │  Golden example bank        │  Per-type accuracy gates
      │  TypeScript only           │  Few-shot prompt injection  │  Fine-tuning on standby
      v                           v                             v
```

Phase 1 must ship before Phase 2 can begin (you need the review UI and stored
images to promote to golden examples). Phase 3 is a logical gate that fires
when enough real documents have been processed to assess accuracy.
Fine-tuning (the original Phase 2 plan) is on standby — activate if context
injection accuracy plateaus below 85% on critical COI fields.

---

## Phase 1 — Foundation (TypeScript, within Next.js app)

### Step 1: Database migration

Migration `0024_vision_extraction_columns.sql`:

```sql
-- content_classification: routing tag for scan vs digital vs mixed
ALTER TABLE policy_documents
  ADD COLUMN IF NOT EXISTS content_classification text
  CHECK (content_classification IN ('digital', 'scan', 'mixed'));

-- extracted_fields: structured JSON from vision models
ALTER TABLE policy_documents
  ADD COLUMN IF NOT EXISTS extracted_fields jsonb;

-- stored_image_url: blob storage reference for uploaded document images
ALTER TABLE policy_documents
  ADD COLUMN IF NOT EXISTS stored_image_url text;

-- Index for vision extraction pipeline queries
CREATE INDEX IF NOT EXISTS idx_policy_documents_vision
  ON policy_documents (content_classification, extraction_status)
  WHERE content_classification IN ('scan', 'mixed');
```

### Step 2: VisionExtractor interface

New file: `lib/intelligence/vision/extractor-interface.ts`

```typescript
/** One field extracted from a document image. */
export type ExtractedField = {
  key: string;           // e.g. "policy_number", "coverage_limit"
  value: string;         // extracted value
  confidence: number;    // 0.0–1.0 model confidence
};

/** A document type tag set by the Classification node. */
export type DocumentTypeTag = 'COI' | 'BOL' | 'delivery_receipt' | 'unknown';

/** Defines what fields to extract for a given document type. */
export type ExtractionSchema = {
  documentType: DocumentTypeTag;
  fields: {
    key: string;
    description: string;
    criticality: 1 | 2 | 3;  // 3 = coverage-voiding if wrong
  }[];
};

/** Result of a vision extraction call. */
export type ExtractionResult = {
  fields: ExtractedField[];
  modelId: string;            // which model produced this (audit trail)
  latencyMs: number;
  unreadableFields: string[]; // fields below per-field unreadable threshold
  costEstimate: number | null; // null for self-hosted models
};

/**
 * Single interface for all vision extraction backends.
 * GptVisionBackend and QwenVisionBackend both implement this.
 * The pipeline calls the interface, not the model.
 */
export interface VisionExtractor {
  extract(
    imageBase64: string,
    schema: ExtractionSchema
  ): Promise<ExtractionResult>;
}
```

### Step 3: GeminiVisionBackend

New file: `lib/intelligence/vision/gemini-backend.ts`

- Calls Gemini 3.1 Pro via direct HTTP (generativelanguage.googleapis.com)
- Multimodal prompt: image (base64 inline_data) + extraction schema → structured JSON
- Retries with exponential backoff (2 retries)
- System instruction: "You are a freight document extraction specialist..."
- Response parsing: strips markdown code fences, extracts JSON fields
- Cost estimation from token usage metadata
- Singleton via `getGeminiVisionBackend()`
- Zero-dependency: no shared LLM client (YAGNI)

### Step 4: Document classification

New file: `lib/intelligence/vision/classification.ts`

**Scan vs digital detection:**
- Image extensions (png, jpg, etc.) → `scan`
- PDF → conservative `scan` (assume scanned until text extraction attempted)
- Text extensions (txt, csv, docx, etc.) → `digital`
- Unknown → conservative `scan`

**Staff upload pipeline:**
- File size limit: 10 MB
- Allowed MIME types: png, jpeg, gif, webp, bmp, tiff, pdf
- Image storage: Vercel Blob via `put()` in Server Action

### Step 5: Vision pipeline orchestrator

New file: `lib/intelligence/vision/pipeline.ts`

`runVisionPipeline()`:
1. Classify document (scan vs digital)
2. If scan → fetch golden examples → call Gemini backend
3. Write results to `policy_documents` (content_classification, extracted_fields, stored_image_url)
4. Graceful degradation: Gemini failure → extraction_status='needs_review', no crash

### Step 6: Server Action + UI

**Server Action** (`app/(console)/console/policies/actions.ts`):
- `addVisionDocumentAction` — validates staff auth, reads file from FormData, uploads to Vercel Blob, converts to base64, calls `runVisionPipeline()`, revalidates paths

**Review UI** (`components/console/policy-intelligence.tsx`):
- `VisionDocumentUploadForm` — file input + document type dropdown + metadata fields
- `VisionDocumentTable` — shows extraction status badges, per-field confidence with color coding (green ≥85%, amber 50-84%, red <50%), model ID, latency, cost estimate
- Staff can view extracted fields alongside the document image
- Confidence pre-filter: unreadable fields (<50%) skip human review and are labeled "requires manual transcription"

---

## Phase 2 — Context Injection (TypeScript, within Next.js app)

Replaces the original fine-tuning plan. Context injection uses Gemini's massive
context window to show the model 3 golden (image, JSON) example pairs before
each real extraction. Zero training cost, instant adaptability.

### Step 7: Golden example database columns

Migration `0025_golden_examples_for_few_shot.sql`:

```sql
ALTER TABLE policy_documents
  ADD COLUMN IF NOT EXISTS is_golden_example boolean NOT NULL DEFAULT false;

ALTER TABLE policy_documents
  ADD COLUMN IF NOT EXISTS image_base64 text;

CREATE INDEX IF NOT EXISTS idx_policy_documents_golden
  ON policy_documents (document_type, is_golden_example)
  WHERE is_golden_example = true AND image_base64 IS NOT NULL;
```

### Step 8: Golden example data access layer

New file: `lib/intelligence/vision/golden-examples.ts`

- `fetchGoldenExamples(documentType)` — queries `policy_documents` WHERE `is_golden_example = true AND image_base64 IS NOT NULL LIMIT 3`
- `promoteDocumentToGolden(documentId, storedImageUrl, extractedFields)` — fetches blob → base64 → updates row
- `demoteGoldenExample(documentId)` — clears `is_golden_example` + `image_base64`
- `countGoldenExamples(documentType)` — returns current count per doc type

### Step 9: Few-shot prompt injection in Gemini backend

Modify `lib/intelligence/vision/gemini-backend.ts`:

- Update `buildGeminiRequest()` to accept optional `FewShotExample[]`
- When examples present: prepend user/model alternating role entries to `contents[]`:
  ```
  [user: example image + prompt] → [model: expected JSON]
  [user: example image + prompt] → [model: expected JSON]
  [user: example image + prompt] → [model: expected JSON]
  [user: REAL image + prompt] → [model: generates JSON]
  ```
- Update `VisionExtractor.extract()` signature with optional `fewShotExamples` param

### Step 10: Pipeline integration

Modify `lib/intelligence/vision/pipeline.ts`:

- Before calling `backend.extract()`, call `fetchGoldenExamples(input.documentType)`
- Pass returned examples to `backend.extract(imageBase64, schema, fewShotExamples)`
- Graceful: if 0 golden examples exist, extraction proceeds as normal (no-op)

### Step 11: Promote/demote Server Actions

New actions in `app/(console)/console/policies/actions.ts`:

- `promoteToGoldenExampleAction` — validates staff auth, fetches image from blob, encodes base64, updates row
- `demoteGoldenExampleAction` — clears golden flags on the document

### Step 12: Promote button in review UI

Modify `components/console/policy-intelligence.tsx`:

- Add "Golden" column to `VisionDocumentTable`
- `GoldenExampleCell` component: shows ★ active button (demote) for golden docs, "promote" button for non-golden docs with stored image + extracted fields, "—" for text-path docs

### Step 13: Seed initial golden examples

Generate 5 clean synthetic COIs (no distortions) via `training/generate_synthetic_coi.py --count 5`.
Staff uploads them through the existing vision upload form, then promotes 3 to golden examples.

### Fine-tuning standby

The 1,000 synthetic COI dataset (`training/coi_train.jsonl`) and the QLoRA training plan
(original Steps 7-12) remain available. Activate if:

1. Context injection accuracy falls below 85% on critical COI fields after 30+ real documents
2. Gemini context window costs become prohibitive at scale
3. A fine-tuned model proves more accurate than context injection in shadow comparison

---

## Phase 3 — Assessment & Conditional Cutover

Phase 3 fires when enough real documents have been processed. It does NOT assume
fine-tuning — it evaluates whether context injection is sufficient.

### Step 14: Per-document-type accuracy tracking

Track extraction accuracy per document type using staff corrections captured in the review UI:

```sql
SELECT
  document_type,
  COUNT(*) AS total_extractions,
  SUM(CASE WHEN staff_corrected THEN 1 ELSE 0 END)::float / COUNT(*) AS correction_rate
FROM policy_documents
WHERE extraction_status IN ('extracted', 'reviewed')
GROUP BY document_type
HAVING COUNT(*) >= 30
```

### Step 15: Context injection sufficiency check

For each document type, check:
1. ≥ 30 real extractions with staff review
2. Correction rate < 15% (i.e., ≥ 85% of extractions accepted without changes)
3. If BOTH conditions met → context injection is sufficient. No fine-tuning needed.
4. If correction rate ≥ 15% → context injection is not sufficient. Evaluate fine-tuning.

### Step 16: Fine-tuning activation (conditional)

Only if Step 15 shows context injection insufficient for a document type:

1. Upload `coi_train.jsonl` to Vertex AI Studio for Gemini supervised fine-tuning
2. After training completes, add `GEMINI_FINETUNED_MODEL` env var
3. Create `GeminiFineTunedBackend` (clone of Gemini backend with different model ID)
4. Run both models in shadow mode until fine-tuned model proves better
5. Cut over per document type

### Step 17: Gemini fallback

Context injection and fine-tuned models both keep Gemini as fallback:
- If any criticality-3 field is below unreadable threshold → re-extract with base Gemini Pro (no few-shot)
- If both fail → mark unreadable, route to manual transcription
```

---

## Files summary

### New files (Phase 1 — TypeScript) ✅

| File | Purpose |
|---|---|
| `db/migrations/0024_vision_extraction_columns.sql` | `content_classification` + `extracted_fields` + `stored_image_url` |
| `lib/intelligence/vision/extractor-interface.ts` | `VisionExtractor` interface + `ExtractionResult` + `FewShotExample` types |
| `lib/intelligence/vision/gemini-backend.ts` | Gemini direct-HTTP backend with retries + few-shot injection |
| `lib/intelligence/vision/extraction-schemas.ts` | Per-document-type field schemas for COI, BOL, delivery_receipt |
| `lib/intelligence/vision/classification.ts` | Scan vs digital content classification |
| `lib/intelligence/vision/pipeline.ts` | Full vision pipeline orchestrator |
| `lib/intelligence/vision/index.ts` | Barrel export |

### New files (Phase 2 — Context Injection) ✅

| File | Purpose |
|---|---|
| `db/migrations/0025_golden_examples_for_few_shot.sql` | `is_golden_example` + `image_base64` columns + index |
| `lib/intelligence/vision/golden-examples.ts` | Golden example CRUD (fetch, promote, demote, count) |
| `training/golden_cois.jsonl` | 5 clean synthetic COIs for golden example seeding |

### Modified files (Phases 1-2)

| File | Change |
|---|---|
| `app/(console)/console/policies/actions.ts` | Added `addVisionDocumentAction`, `promoteToGoldenExampleAction`, `demoteGoldenExampleAction` |
| `components/console/policy-intelligence.tsx` | Added `VisionDocumentUploadForm`, `VisionDocumentTable`, `GoldenExampleCell` |
| `lib/intelligence/policy-service.ts` | Added `stored_image_url`, `content_classification`, `extracted_fields`, `is_golden_example`, `image_base64` to `PolicyDocumentRow` |
| `lib/intelligence/vision/extractor-interface.ts` | Added `FewShotExample` type + optional param on `extract()` |
| `lib/intelligence/vision/gemini-backend.ts` | Modified `buildGeminiRequest()` for few-shot injection |
| `lib/intelligence/vision/pipeline.ts` | Fetches golden examples before extraction |
| `lib/intelligence/vision/index.ts` | Added golden-examples exports |

### Standby assets (Phase 3 — if needed)

| File | Purpose |
|---|---|
| `training/generate_synthetic_coi.py` | Synthetic COI generation (real ACORD 25 template + distortions) |
| `training/coi_train.jsonl` | 700 training examples for Vertex AI fine-tuning |
| `training/coi_val.jsonl` | 150 validation examples |
| `training/coi_test.jsonl` | 150 test examples |

---

## What is NOT built

Per the 40 decisions in the exploration doc:
- No Kafka/RabbitMQ event stream (Q7)
- No general-purpose freight chatbot (Q8)
- No generative dispute drafting (Q8)
- No autonomous market monitoring (Q8)
- No document-level or entity embeddings in pgvector (Q9)
- No auto-activation of rules — suggest-only invariant holds throughout (Q10)
- No QLoRA fine-tuning (Q35 — on standby)
- No RAG vector search (Q38 — deferred until 20+ golden examples)
- No Modal GPU infrastructure (Q35 — context injection replaces for now)

---

## Cost model

| Phase | Cost driver | Estimate |
|---|---|---|
| Phase 1 | Gemini 2.5/3.1 Pro API per scanned page | Variable, scale-dependent |
| Phase 2 | Gemini API + ~1,500–4,500 extra input tokens for 3 few-shot examples | ~$0.003–0.006 extra per request |
| Phase 3 (if fine-tuning) | Vertex AI training + inference | $10–40 one-time training; inference ~Gemini pricing |
| Steady state | Context injection with Gemini | Marginal overhead over bare extraction; zero training cost |
