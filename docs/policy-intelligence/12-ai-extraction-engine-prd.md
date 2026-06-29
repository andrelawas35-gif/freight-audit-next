# PRD: AI Vision Extraction Engine for Policy Documents

> **Triage:** `ready-for-agent` → **`in-progress`** (Phase 1 deployed, Phase 2 context injection live)
> **Derived from:** Grilling sessions 2026-06-28 (34 + 10 + 6 decisions)
> **Status:** Phase 1 deployed, Phase 2 context injection (few-shot) implemented. Fine-tuning on standby.

## Phase 2 — Context Injection (2026-06-28, grilling pivot)

**Decision:** Sequence context injection before fine-tuning. Fine-tuning remains on standby if context injection hits an accuracy ceiling.

| Step | Status |
|---|---|
| Schema injection (systemInstruction + strict JSON mode) | ✅ Already in `gemini-backend.ts` since Phase 1 |
| Migration 0025: `is_golden_example` + `image_base64` | ✅ Applied |
| Golden examples data access (`golden-examples.ts`) | ✅ `fetchGoldenExamples`, `promoteDocumentToGolden`, `demoteGoldenExample` |
| Few-shot prompt injection in `buildGeminiRequest()` | ✅ User/model alternating role entries prepended to `contents[]` |
| Pipeline fetches golden examples per document type | ✅ `runVisionPipeline` calls `fetchGoldenExamples()` |
| `promoteToGoldenExampleAction` Server Action | ✅ Fetches blob → base64 → updates row |
| `demoteGoldenExampleAction` Server Action | ✅ Clears `is_golden_example` + `image_base64` |
| Promote/demote button in `VisionDocumentTable` | ✅ Golden column with ★ active / promote toggle |
| 5 synthetic golden COIs generated | ✅ `training/golden_cois.jsonl` (clean ACORD 25s) |
| Fine-tuning dataset (1,000 COIs) | ⏸️ On standby (`coi_train.jsonl`) |

**Golden example config:** 3 examples per document type, static few-shot (not RAG), `image_base64` cached at promotion time. RAG upgrade when 20+ examples accumulated.

## Implementation Decisions (2026-06-28 grilling addenda)

| Decision | Sessions | Implemented |
|---|---|---|
| Vision model | GPT-4o → **Gemini 2.5/3.1 Pro** | ✅ Direct HTTP backend |
| API integration | Shared LLM client → **Direct HTTP** | ✅ `gemini-backend.ts` |
| Image storage | Unspecified → **Vercel Blob** | ✅ Server Action upload |
| COI fields | Unspecified → **10 fields** criticality 1-3 | ✅ `extraction-schemas.ts` |
| Migration columns | 2 → **3** (+ `stored_image_url`) | ✅ Migration 0024 |
| Phase 2 approach | Fine-tuning → **Context injection first** | ✅ Migration 0025 + few-shot |
| Example count | — → **3 per doc type** | ✅ Static few-shot in prompt |
| Example storage | — → **`policy_documents` with flags** | ✅ `is_golden_example` + `image_base64` |
| Example caching | — → **base64 at promotion time** | ✅ `promoteDocumentToGolden()` |
| RAG retrieval | — → **Deferred (static for now)** | ✅ No vector store needed yet |

## Files Created

| File | Purpose |
|---|---|
| `db/migrations/0024_vision_extraction_columns.sql` | `content_classification` + `extracted_fields` + `stored_image_url` |
| `db/migrations/0025_golden_examples_for_few_shot.sql` | `is_golden_example` + `image_base64` + golden index |
| `lib/intelligence/vision/extractor-interface.ts` | `VisionExtractor` interface + `ExtractionResult` + `FewShotExample` types |
| `lib/intelligence/vision/extraction-schemas.ts` | COI/BOL/delivery_receipt field schemas |
| `lib/intelligence/vision/gemini-backend.ts` | Gemini direct-HTTP backend with retries + few-shot injection |
| `lib/intelligence/vision/classification.ts` | Scan vs digital content classification |
| `lib/intelligence/vision/pipeline.ts` | Full vision pipeline orchestrator (fetches golden examples) |
| `lib/intelligence/vision/golden-examples.ts` | Golden example CRUD (fetch, promote, demote, count) |
| `lib/intelligence/vision/index.ts` | Barrel export |
| `training/golden_cois.jsonl` | 5 clean synthetic COIs for initial golden example seeding |

## Files Modified

| File | Change |
|---|---|
| `app/(console)/console/policies/actions.ts` | Added `addVisionDocumentAction`, `promoteToGoldenExampleAction`, `demoteGoldenExampleAction` |
| `components/console/policy-intelligence.tsx` | Added `VisionDocumentUploadForm`, `VisionDocumentTable`, `GoldenExampleCell` with promote/demote |
| `lib/intelligence/policy-service.ts` | Added `stored_image_url`, `content_classification`, `extracted_fields`, `is_golden_example`, `image_base64` to `PolicyDocumentRow` |
| `lib/intelligence/vision/extractor-interface.ts` | Added `FewShotExample` type, optional `fewShotExamples` param on `VisionExtractor.extract()` |
| `lib/intelligence/vision/gemini-backend.ts` | Modified `buildGeminiRequest()` to inject few-shot examples as user/model alternating `contents` entries |
| `lib/intelligence/vision/pipeline.ts` | Added `fetchGoldenExamples()` call before `backend.extract()` |
| `lib/intelligence/vision/index.ts` | Added golden-examples exports |

## Prerequisites for Deploy

1. **Run migrations:** `DATABASE_URL=... npx tsx db/migrate.ts` (applies `0024` + `0025`)
2. **Set env vars:** `GEMINI_API_KEY` (Google AI Studio key), `BLOB_READ_WRITE_TOKEN` (Vercel Blob)
3. **Seed golden examples:** Upload the 5 synthetic COIs via the policy detail page, then click "promote" on 3 of them in the document table
4. **Verify:** Upload a scanned COI → check that extraction uses few-shot examples (visible in Gemini API latency bump of ~200ms for examples)

---

## Problem Statement

Policy Intelligence staff receive scanned, handwritten, and photographed freight
documents daily — stamped-and-re-scanned ACORD 25 Certificates of Insurance, Bills
of Lading with ballpoint shortage annotations in the margins, and smartphone photos
of delivery receipts taken in dark warehouses. These documents are the baseline in
freight and compliance, not an edge case.

The existing text extraction pipeline (`T1 tokenizer → T2 LLM mapper`) can only
process born-digital PDFs. Scanned documents produce empty or garbled `raw_text`,
bouncing to human transcription or silently failing. This creates a coverage gap:
documents that are essential for insurance compliance verification and gateway
readiness assessment are invisible to the automated pipeline.

Staff manually transcribe these documents, which is slow, expensive, and unscalable
as client volume grows.

## Solution

Add a **vision extraction path** to the existing 4-tier Policy Intelligence pipeline.
Documents that fail text extraction fall through to a vision model that reads text
from images — stamps, handwriting, low-resolution scans, smartphone photos. The
pipeline routes automatically: digital documents stay on the free text path; scanned
documents go to vision.

Two vision models run in the architecture:
- **GPT VLM API** — production extraction on day one
- **Fine-tuned Qwen2-VL-7B** — a custom model trained on synthetic freight documents,
  deployed in shadow mode, gradually replacing GPT as it proves more accurate

The existing suggest-only invariant is preserved: vision models propose extractions,
humans confirm before rules go active. Low-confidence fields are flagged as
"unreadable" and skip human review entirely, routing to manual transcription.

## User Stories

### Document classification & routing

1. As a **staff member uploading a policy document**, I want the system to
   automatically detect whether it's a digital PDF or a scanned image, so that
   I don't need to manually classify every upload.

2. As a **staff member**, I want to tag a document with its type (COI, BOL,
   delivery receipt), so that the extraction engine knows which fields to look for.

3. As a **staff member**, I want documents with mixed pages (some digital, some
   scanned) to be handled correctly, so that no content is lost.

### GPT vision extraction (day one)

4. As a **staff member reviewing a scanned COI**, I want the system to extract
   policy numbers, coverage limits, additional insured names, and endorsement
   dates from the image, so that I don't have to type them manually.

5. As a **staff member reviewing a scanned BOL**, I want the system to extract
   tracking numbers, pallet counts, and handwritten damage annotations, so that
   shipment data enters the pipeline automatically.

6. As a **staff member**, I want extracted fields to flow into the existing
   rule creation workflow (T2 mapper → review → policy_rules), so that vision
   extraction fits into my current process without learning a new tool.

### Confidence and trust boundary

7. As a **staff member reviewing extractions**, I want to see a confidence
   score next to each extracted field, so that I know which values to scrutinize
   and which to trust.

8. As a **staff member**, I want low-confidence fields to be clearly flagged
   as "unreadable" and not presented for my review, so that I don't waste time
   squinting at a blurry scan to confirm what the model couldn't read.

9. As a **compliance officer**, I want the suggest-only invariant preserved
   for vision-extracted data — no rules auto-activate without human confirmation,
   so that incorrect extractions don't create incorrect policy rules.

### Review UI for vision output

10. As a **staff member correcting an extraction**, I want to edit any field
    value inline, so that I can fix errors quickly.

11. As a **platform operator**, I want every staff correction to be captured
    as a training example (document image + model output + human-corrected value),
    so that the fine-tuned model improves over time.

### Fine-tuned model (long-term)

12. As a **platform operator**, I want a custom fine-tuned vision model that
    extracts from freight documents with higher accuracy than general-purpose
    APIs, so that the platform is differentiated and costs are controlled.

13. As a **platform operator**, I want the fine-tuned model to run in shadow
    mode alongside GPT before replacing it, so that I can validate its quality
    on real documents without risking production accuracy.

14. As a **platform operator**, I want to cut over from GPT to the fine-tuned
    model per document type (COI, BOL, delivery receipt), so that a model that
    excels at COIs but struggles with BOL marginalia can be deployed where it's
    ready and held back where it isn't.

15. As a **platform operator**, I want GPT to remain available as a fallback
    even after cutover, so that if the fine-tuned model produces low-confidence
    output on a critical field, the document re-extracts with GPT.

### Cost management

16. As a **platform operator**, I want digital documents to remain on the
    zero-cost text extraction path, so that vision API costs are only incurred
    when necessary.

17. As a **platform operator**, I want the long-term cost of vision extraction
    to approach near-zero per document by replacing per-call API costs with a
    self-hosted fine-tuned model.

## Implementation Decisions

### Architecture: extend, don't replace

The existing 4-tier extraction pipeline (T1 deterministic tokenizer → T2 LLM mapper
→ T3 vector memory bank → T4 client ambiguity dashboard) is not modified. The vision
path is added as a parallel node. Documents are routed at the Classification step:
digital text → existing T1→T2 path, scanned images → new vision path, mixed → split
pages per type.

### Single VisionExtractor interface

A single interface abstracts all vision backends (GPT VLM API and fine-tuned Qwen).
The pipeline calls the interface, not the model. This enables hot-swapping backends
via feature flag, shadow mode (both models run, outputs compared), gradual cutover
(per document type), and fallback (Qwen low confidence → GPT).

Interface shape:

```typescript
interface VisionExtractor {
  extract(imageBase64: string, schema: ExtractionSchema): Promise<ExtractionResult>;
}

type ExtractionSchema = {
  documentType: 'COI' | 'BOL' | 'delivery_receipt' | 'unknown';
  fields: { key: string; description: string; criticality: 1 | 2 | 3 }[];
};

type ExtractionResult = {
  fields: { key: string; value: string; confidence: number }[];
  modelId: string;
  latencyMs: number;
  unreadableFields: string[];
};
```

### Schema-driven extraction per document type

The Classification node tags documents with a type. The extraction engine uses a
type-specific field schema — COI fields (policy number, coverage limits, additional
insured) are different from BOL fields (tracking number, pallet count, damage
annotations). This keeps extraction prompts tight and training data grouped by type,
which is critical for fine-tuning quality.

### Data landing zone

Vision extraction output writes to a new `extracted_fields` JSONB column on
`policy_documents`. Text path continues using `raw_text`. Both feed into the
same T2 mapper → human review → `policy_rules` flow. The `policy_documents`
table remains the single source for what was extracted from a document.

### Content classification

A new `content_classification` column on `policy_documents` holds one of three
values: `digital` (born-digital PDF, text path works), `scan` (fully scanned,
routes to vision), or `mixed` (hybrid, pages split by type). Classification is
automatic: the system attempts text extraction; no extractable text on any page
→ `scan`; all pages extractable → `digital`; mixed → `mixed`.

### Suggest-only invariant tightened for vision

Vision extraction output carries a per-field confidence score. Fields below an
empirically calibrated threshold (derived from the held-out test set) are
classified as "unreadable" and skip human review entirely — they go to manual
transcription. Fields above threshold are suggested to human review with a
confidence indicator. This tightens the suggest-only boundary: staff aren't
asked to confirm low-certainty extractions that are likely wrong.

### Training flywheel: corrections as implicit labels

The review UI captures field-level diffs. When a staff member changes an
extracted value, the `(document image, model output, human correction)` triple
is automatically recorded as a labeled training example. No separate labeling
workflow. The training dataset grows organically as staff does their normal job.

### Dual-model strategy

**Short term (GPT production):** GPT VLM API handles all vision extraction.
**Medium term (Qwen shadow):** A Qwen2-VL-7B model, fine-tuned on synthetic
freight documents, runs in shadow mode — both models extract, outputs compared,
no production impact. **Long term (Qwen production):** Qwen replaces GPT per
document type when its human agreement rate meets or exceeds GPT's.

### Synthetic data bootstrap

A synthetic data generation pipeline produces training examples for initial
fine-tuning: a real blank ACORD 25 form is populated with randomized data,
then composite distortions are applied (rotation, blur, noise, ink stamps,
handwriting overlays, low-resolution artifacts). Each generated image has
exact ground truth because every field value was placed programmatically.
Target: 1,000 synthetic examples for initial fine-tuning.

### QLoRA fine-tuning on Qwen2-VL-7B

The base model is quantized to 4-bit. A LoRA adapter (rank 16, attention layers)
is trained via HuggingFace Transformers + PEFT + bitsandbytes. The adapter is
10–50 MB — small enough to store multiple versions and swap at inference time.
Training runs on Modal GPU (serverless, consistent with the Vercel + Neon
managed stack). Evaluation: weighted field-level accuracy ≥ 85% on a held-out
test set with critical-field weighting (coverage-limit errors are weighted 3×
higher than broker-name errors).

### Cutover gate: per-document-type human agreement rate

A document type graduates from GPT to Qwen when two conditions are both met:
(1) at least 30 real-world reviewed documents exist for that type, and (2) the
lower bound of a 90% binomial confidence interval on Qwen's agreement rate
exceeds GPT's agreement rate. This per-type gate prevents a pooled average
from hiding poor performance on one category.

### No event stream

The existing Postgres-backed job queue (`FOR UPDATE SKIP LOCKED` on `audit_jobs`)
handles async work. A `pipeline_step` column tracks document stage. Kafka/RabbitMQ
is deferred until Postgres throughput becomes a proven bottleneck.

### Scope boundary

This is a **Policy Extraction Engine**: unstructured freight/compliance documents
in, structured `policy_rules` out. The following are explicitly excluded:
- General-purpose freight chatbot
- Generative dispute drafting
- Autonomous market monitoring
- Document-level or entity embeddings in pgvector

### Schema changes

- `policy_documents`: new columns `content_classification` (text, CHECK constraint
  for `digital`/`scan`/`mixed`) and `extracted_fields` (JSONB, nullable)
- New table: `shadow_comparisons` (tracks GPT vs Qwen agreement per field per
  document for cutover decisions)

### Infrastructure

- **Phase 1 (TypeScript, Next.js app):** VisionExtractor interface, GPT backend,
  classification logic, review UI diff capture. Deployed on existing Vercel stack.
- **Phase 2 (Python, Modal):** Synthetic data generation (CPU), QLoRA training
  (GPU), inference endpoint (GPU). Deployed on Modal serverless GPU — no always-on
  servers, no SSH management.
- **Phase 3 (TypeScript, Next.js app):** Cutover logic — a routing flag flip, no
  new infrastructure.

## Testing Decisions

### What makes a good test

Tests should validate external behavior — what the system produces, not how it
produces it. Mock the VisionExtractor interface for unit tests. Use real backends
for integration tests against synthetic documents with known ground truth.

### Modules to test

| Module | Test type | Approach |
|---|---|---|
| VisionExtractor interface | Unit | Mock implementation returns controlled results; verify pipeline routing |
| GPT backend | Integration | Real API call against a known test image; verify field extraction |
| Classification node | Unit | Feed PDFs with known properties; verify correct `content_classification` |
| Review UI diff capture | Component | Simulate staff correction; verify training example record created |
| Shadow comparison | Unit | Feed controlled agreement/disagreement data; verify gate logic |
| Cutover gate | Unit | Feed edge-case agreement rates; verify confidence interval math |
| Qwen backend | Integration | Deploy to Modal staging; extract from synthetic test images with known ground truth |

### Prior art

- Existing T2 classifier tests in `lib/intelligence/` use the same DB mocking
  patterns via Vitest + Neon
- Existing pipeline orchestration tests validate the T1→T3→T2→T4 flow; vision
  path tests follow the same structure
- Existing `reports.ts` tests (`lib/__tests__/`) validate SQL query correctness;
  new shadow comparison queries follow the same pattern

## Out of Scope

- Kafka/RabbitMQ event stream (deferred until Postgres job queue bottleneck is proven)
- General-purpose freight chatbot or Q&A over extracted data
- Generative dispute letter drafting
- Autonomous market monitoring (e.g., "FedEx updated their tariff, 3 clients affected")
- Document-level or entity embeddings in pgvector (clause dedup in T3 is unchanged)
- Auto-activation of policy rules — human review gate remains mandatory for all extractions
- Document-type auto-detection (staff selects COI/BOL/delivery_receipt from a dropdown)
- Wrinkle/fold simulation in synthetic data generation (add later if needed)
- Qwen3-VL migration (re-evaluate when it ships; unchanged pipeline)

## Further Notes

### Rationale for Qwen2-VL-7B over Qwen3-VL

Qwen2-VL-7B is stable, released, and has mature fine-tuning ecosystem support.
Qwen3-VL release date is unknown. The entire pipeline (generation, training,
evaluation, deployment) is model-agnostic — porting to Qwen3-VL is a training
re-run, not a rewrite. By the time Qwen3-VL ships, the Qwen2-VL system will
be in production, and Qwen3-VL can be evaluated in shadow mode using the same
cutover gates.

### Rationale for QLoRA over full fine-tuning

QLoRA runs on a single consumer GPU (RTX 4090) with a 4-bit base model. The
adapter is 10–50 MB vs 14 GB for a full checkpoint. This is form-field extraction
(domain adaptation), not teaching vision from scratch — LoRA excels at this.
The 1–3% accuracy gap vs full fine-tuning is compensated by generating more
synthetic examples (near-free).

### Rationale for starting with ACORD 25 COI

The COI is the most structured document type in the freight domain. It has a
known layout, predictable distortion patterns (broker stamps, handwriting in
designated annotation areas), and the highest business impact (a wrong coverage
limit voids insurance). Success here proves the pipeline before tackling harder
cases like BOL marginalia.

### Domain reality: scanned documents are the baseline

Stamped-and-re-scanned COIs, BOLs with ballpoint annotations, and smartphone
photos of delivery receipts are daily material in freight and compliance. The
existing text pipeline cannot read these. Vision extraction is necessary for
domain coverage — not a nice-to-have. The cost calculus: vision extraction
replaces human transcription labor, not an already-working automated path.
