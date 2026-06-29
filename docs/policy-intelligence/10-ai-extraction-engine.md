# AI Extraction Engine (Exploratory)

> **Grilling sessions:** 2026-06-28 (34 decisions) + 2026-06-28 context injection pivot (6 decisions).
> **Status:** Phase 1 deployed. Phase 2 is **context injection (few-shot)** — fine-tuning on standby.
> Extend the existing 4-tier pipeline with vision extraction. Production: Gemini 3.1 Pro
> with schema injection + few-shot context injection. Fine-tuning dataset (1,000 synthetic COIs)
> held in reserve if context injection hits an accuracy ceiling.

## Architecture delta

The existing 4-tier pipeline (deterministic → LLM → vector → human dashboard) stays.
New nodes are added in parallel, not as replacements.

```
                    ┌─ Text/EDI path (existing T1→T2) ─────────────┐
Classification ─────┤                                              ├── Business Validation ──→ policy_rules
(scan vs digital,   └─ Vision path ─┬─ Gemini backend (production) ─┤    (domain invariants)
 doc type tag)                      │   + schema injection          │
                                    │   + few-shot context injection│
                                    │   (Phase 2: static 3 examples)│
                                    │                               │
                                    └─ Fine-tuning (standby)        │
                                       Qwen/VL QLoRA on 1K synth COIs
                                              │
                                              ▼
                                     Training flywheel: human corrections → labeled examples
                                               │
                                               ▼
                                     Golden example bank: promoted docs → few-shot injection
```

---

## Domain reality (mid-session correction)

Scanned/handwritten/messy documents are the baseline in freight & compliance — not an
edge case. Stamped-and-re-scanned ACORD 25 COIs, BOLs with ballpoint shortage/damage
marginalia, and smartphone photos of delivery receipts are daily material. The existing
text pipeline cannot read these; they bounce to humans or silently fail. Vision
extraction is necessary for domain coverage, not a nice-to-have. This changed the
cost calculus: vision extraction replaces human transcription labor, not an
already-working automated path.

---

## Grilling Q&A

### Q1: Replace the 4-tier pipeline or extend it?

**Question:** Your current Policy Intelligence module already has a 4-tier extraction
pipeline, suggest-only invariant, backtest infrastructure, and Gateway Readiness
reports. The proposed diagram shows a fully autonomous multi-agent pipeline with
event streams, multimodal vision extraction, and cross-document entity resolution.
Is this about replacing the 4-tier pipeline or extending it with new capabilities?

**Recommendation:** Extend, don't replace. The architectural shapes already match.
The proposed diagram is the same design with two new nodes (vision extraction,
cross-doc linking) and a different transport layer. Replacing would destroy the
taxonomy enums, `rule_key` namespace, condition/action JSON shape, and backtest
infrastructure — all hard-won domain modeling.

**Resolved: Extend.** ✅

---

### Q2: What triggers the vision extraction path?

**Question:** Your text/EDI pipeline is near-zero cost. Vision extraction invokes
expensive multimodal models. Are documents routed to vision via pre-classification
signal, source-type heuristic, or confidence gating?

**Recommendation:** Confidence gating. Text path tries first. If the deterministic
tokenizer or LLM mapper returns nulls or below-threshold confidence, the document
falls through to vision. Keeps the common case cheap (digital invoices stay on the
$0 text path) and reserves vision for genuinely hard cases — scanned PDFs,
handwritten forms, photographed documents.

**Resolved: Confidence gating.** ✅

> **Mid-session revision:** After the domain reality discussion (see above), the
> "5–10% of docs" assumption was revised. The actual scan-to-digital ratio in
> freight is likely much higher. Confidence gating still holds, but the threshold
> and cost model need recalibration against real inbound document composition.

---

### Q3: Where does the Shared Logistics & Compliance Ontology live?

**Question:** The diagram shows a shared ontology feeding the validation node.
Your current system has `lib/intelligence/taxonomy.ts`, a `rule_key` namespace,
and gateway/insurance category enums. Is this ontology curated by staff, learned
from data, or imported from industry standards?

**Recommendation:** Curated with suggest-only discovery pipeline. Staff-maintained
`taxonomy.ts`. T3 vector memory bank surfaces recurring clauses across clients;
when a pattern appears across 3+ clients with no matching `rule_key`, the system
suggests a new category to staff. Staff promotes it. Prevents LLM drift from
polluting canonical categories.

**Resolved: Curated + suggest-only discovery.** ✅

---

### Q4: What specifically is cross-doc linking resolving?

**Question:** The diagram has a "Cross-Doc Linking & Entity Resolution" node.
Is this resolving same-shipment-different-docs, same-policy-different-versions,
shipment-to-applicable-policies, or cross-client pattern detection?

**Recommendation:** Scope it narrowly to **shipment ↔ policy documents in force on
ship date**. That's the `ShipmentPolicyContext` your backtest evaluator already
consumes. Same-policy versioning is already handled by `policy_rulesets`.
Cross-client pattern detection is your existing T3→T1 ontology feedback loop.

**Resolved: Shipment ↔ policies in force on ship date.** ✅

---

### Q5: What does the Correction & Business Validation agent do?

**Question:** Your current pipeline already validates extraction output (Zod-gated
T2 mapper). The diagram proposes a standalone validation node. Is this schema
validation, business logic validation, or a self-correction loop?

**Recommendation:** Business logic validation. Check extracted clauses against
known domain invariants before they land in `policy_rules` — prevents nonsense
rules (negative deductible, effective date before carrier was founded) from
even reaching human review. Schema validation is already handled by Zod.
Self-correction (model detects its own errors and retries) is a harder AI
problem for later.

**Resolved: Business logic validation.** ✅

---

### Q6: What is the Classification node classifying?

**Question:** Your current system already ingests documents and classifies them
by `policy_type`. The diagram puts a Classification node as the first step —
before any extraction. Is this content-type routing, document-type auto-detection,
or urgency triage?

**Recommendation:** Content-type routing: scan → vision path, digital text →
text path. Document-type auto-detection saves a dropdown click — low ROI to
automate. Urgency triage only matters at scale with an extraction backlog.

**Resolved: Content-type routing.** ✅

---

### Q7: Why the event stream (Kafka/RabbitMQ)?

**Question:** The diagram routes every inter-node message through an event
stream. Your current system uses a Postgres-backed job queue (`FOR UPDATE SKIP
LOCKED`) that works. Does the event stream unlock multiple consumers, replay
for reprocessing, throughput at scale, or decoupled team ownership?

**Recommendation:** Defer the event stream. None of the justifications apply
today. Keep the Postgres job queue. Add a `pipeline_step` enum column to track
document stage. The architecture diagram is conceptually correct — nodes are
the right abstraction — but the transport layer is premature optimization.

**Resolved: Defer Kafka/RabbitMQ.** ✅

---

### Q8: What does "Freight-Native & Compliance-Native" exclude?

**Question:** The engine is branded as a freight-native and compliance-native
AI engine. What capabilities are deliberately out of scope? Natural language
query? Generative dispute drafting? Autonomous market monitoring?

**Recommendation:** Define it narrowly as the **Policy Extraction Engine** —
input is unstructured freight/compliance documents, output is structured
`policy_rules`. Not a general-purpose freight chatbot, not a generative dispute
writer, not a market monitor. Everything else (chat, dispute drafting, monitoring)
are separate products that consume the engine's output.

**Resolved: Policy Extraction Engine scope.** ✅

---

### Q9: What is pgvector storing?

**Question:** The diagram labels persistence as "PostgreSQL / pgvector." Your
current system uses pgvector for T3 clause dedup. Adding vision and cross-doc
linking doesn't obviously create new vector workloads. Is pgvector for clause
dedup, document embeddings, entity embeddings, or all three?

**Recommendation:** Stick with clause dedup only (current T3 usage). No
document-level or entity embeddings. `policy_rules` is the single authority;
a vector index shouldn't become a shadow authority that can disagree with
structured rules.

**Resolved: Clause dedup only.** ✅

---

### Q10: Does the suggest-only boundary hold for vision?

**Question:** Invariant #4: "AI is suggest-only — humans confirm. Never
auto-apply." Text extraction lets a human compare extracted clauses
side-by-side with the source PDF. Vision extraction produces output from
an image of a handwritten form — the review surface is fundamentally different.
Does the boundary tighten or loosen?

**Recommendation:** Tighten. Vision extraction output carries a confidence
score per field. Fields below threshold never reach human review — they go
straight to "unreadable, needs manual transcription." The human isn't asked
to squint at a blurry scan to confirm whether the AI read "$5,000" or
"$50,000." The invariant stays, but a confidence pre-filter short-circuits
low-certainty extractions before they consume human attention.

**Resolved: Confidence pre-filter tightens suggest-only for vision.** ✅

---

### Q11: What's the model abstraction boundary?

**Question:** With GPT VLM in production and fine-tuned Qwen3-VL in development,
how does the pipeline route between them? Should it know which model is running?

**Recommendation:** Single `VisionExtractor` interface. `GptVisionBackend` and
`QwenVisionBackend` both implement it. The pipeline calls the interface, not the
model. Enables hot-swap via feature flag, shadow mode (both run, compare outputs),
gradual cutover (10% → 50% → 100% to Qwen), and fallback (Qwen low confidence →
GPT).

**Resolved: Single `VisionExtractor` interface.** ✅

---

### Q12: How does training data get captured?

**Question:** Fine-tuning Qwen3-VL needs labeled examples. Does training data
flow through the same production pipeline, a separate labeling mode, or implicit
capture from corrections?

**Recommendation:** Hybrid — corrections as implicit labels. The suggest-only
invariant already requires human review. If the review UI captures field-level
diffs (which fields the human changed), every correction automatically becomes
a labeled training example. No extra button, no separate labeling mode. The
training dataset grows organically as staff does their normal job. The only
net-new requirement is field-level diff capture in the review UI.

**Resolved: Field-level diffs as implicit labels.** ✅

---

### Q13: What extracts documents before you have training data?

**Question:** The training flywheel is elegant but has a day-one problem — zero
labeled examples. GPT VLM is the only working extractor. How do you bootstrap?

**Recommendation:** Combine synthetic data with GPT-first production. Generate
synthetic training data (clean forms + programmatic distortion/stamps/handwriting
overlays). Fine-tune Qwen3-VL on synthetic data for day-one shadow deployment.
GPT handles production extraction. Real human corrections accumulate over
weeks/months. Fine-tune Qwen on the growing real dataset. When real-example
performance meets or exceeds synthetic-only performance, the flywheel is
self-sustaining.

**Resolved: Synthetic bootstrap, then real data flywheel.** ✅

---

### Q14: Where does the fine-tuned Qwen3-VL run?

**Question:** You have a Vercel + Neon serverless stack. A fine-tuned VLM
needs a GPU. Where does it live?

**Recommendation:** Modal or Replicate — serverless GPU inference. Consistent
with the fully-managed stack (Vercel + Neon). No always-on GPU server to SSH
into. Cold-start GPU containers: you pay only when extracting. The
`QwenVisionBackend` calls `https://your-app.modal.run/extract` — same API
pattern as calling GPT, different endpoint.

**Resolved: Modal or Replicate serverless GPU.** ✅

---

### Q15: Universal extraction schema or per-document-type?

**Question:** Vision extraction reads specific fields from specific forms
(COI: policy number, coverage limits; BOL: pallet count, damage annotations).
Does the extractor take a schema parameter or return a universal extraction?

**Recommendation:** Schema-driven, per document type. The Classification node
tags document type (COI, BOL, delivery_receipt). The extractor receives the
document + type tag and uses a type-specific extraction schema. Keeps prompts
tight, validation specific, and training data grouped by document type — which
matters for fine-tuning quality.

**Resolved: Schema-driven, per document type.** ✅

---

### Q16: Where does vision extraction output land?

**Question:** Your text pipeline puts extracted text into `policy_documents.raw_text`.
Vision extraction produces structured fields, not raw text. Where do they go?

**Recommendation:** New `extracted_fields` JSONB column on `policy_documents`.
Text path uses `raw_text`, vision path uses `extracted_fields`. Both feed into
the same T2 mapper → human review → `policy_rules` flow. The suggest-only
boundary is preserved. The `policy_documents` table stays the single source of
"what did we extract from this document?" No bypassing T2 for auto-activation.

**Resolved: New `extracted_fields` JSONB column.** ✅

---

### Q17: When do you stop paying GPT and switch to the fine-tuned model?

**Question:** GPT in production, Qwen in shadow. Both produce extractions.
Training data accumulates. What's the cutover trigger?

**Recommendation:** Per-document-type human agreement rate. Qwen must match or
exceed GPT's agreement rate with human corrections for a given document type
before cutting over for that type. Per-type gate prevents a pooled average
from hiding a disaster on BOL marginalia while COI performance looks great.
Shadow mode tracks `(documentType, modelId, extraction, correction, agreement)`
for every reviewed document.

**Resolved: Per-document-type human agreement rate gate.** ✅

---

## 3-phase build plan

### Phase 1 — Ship Gemini vision extraction ✅ DEPLOYED

1. Add `content_classification`, `extracted_fields`, `stored_image_url` columns to `policy_documents`
2. Build `VisionExtractor` interface + `GeminiVisionBackend`
3. Document classification: scan vs digital routing
4. Wire extraction output into `extracted_fields` → T2 mapper → review → `policy_rules`
5. Staff upload via Vercel Blob + Server Action
6. Vision document review UI in policy detail page

### Phase 2 — Context injection (few-shot) ✅ DEPLOYED

6. Add `is_golden_example` + `image_base64` columns to `policy_documents`
7. Build golden example CRUD (promote/demote/fetch)
8. Modify `GeminiVisionBackend` to inject few-shot examples (static, 3 per doc type)
9. Add promote/demote button to vision document table
10. Generate 5 clean synthetic COIs for initial seeding
11. **Fine-tuning dataset (1,000 COIs) held on standby** — activate if context injection accuracy plateaus

### Phase 3 — Per-document-type assessment (when enough real documents)

11. Track extraction accuracy per document type (staff corrections vs model output)
12. If context injection accuracy < 85% on critical COI fields → evaluate fine-tuning
13. If fine-tuning warranted → train on Vertex AI with 1K synthetic dataset
14. If fine-tuning beats context injection → cut over per document type
15. GPT/Gemini fallback always available for low-confidence re-extraction

## Cost model

| Phase | Cost driver | Estimate |
|---|---|---|
| Phase 1: Gemini-only | Gemini 2.5/3.1 Pro API per scanned page | Variable, scale-dependent |
| Phase 2: Context injection | Gemini API + ~1,500–4,500 extra input tokens for 3 few-shot examples | ~$0.003–0.006 extra per request |
| Phase 3: Fine-tuning (standby) | Vertex AI training + inference | $10–40 one-time training; inference comparable to Gemini API |
| Steady state | Context injection with Gemini | Slightly higher per-request cost than bare extraction, but zero training overhead |

## What existing code changes

- `policy_documents` table: +5 columns (content_classification, extracted_fields, stored_image_url, is_golden_example, image_base64)
- New module: `lib/intelligence/vision/` (interface, Gemini backend, schemas, classification, pipeline, golden examples)
- Server Actions: `addVisionDocumentAction`, `promoteToGoldenExampleAction`, `demoteGoldenExampleAction`
- Review UI: `VisionDocumentUploadForm`, `VisionDocumentTable` with promote/demote, field-level confidence display
- Nothing else. No existing pipeline code is replaced.

## What is NOT built

- Kafka/RabbitMQ event stream
- General-purpose freight chatbot
- Generative dispute drafting
- Autonomous market monitoring
- Document-level or entity embeddings in pgvector
- Auto-activation of rules (suggest-only invariant holds)

---

## Synthetic data fine-tuning system (Qwen2-VL-7B)

> Follow-up grilling 2026-06-28. Concrete recommendations for building the synthetic
> data generation + QLoRA fine-tuning pipeline targeting Qwen2-VL-7B, starting with
> ACORD 25 COI extraction.

### Q18: Which document type first?

**Question:** Fine-tuning is per-document-type. COI, BOL, or delivery receipt?

**Recommendation:** Start with ACORD 25 COI. Most structured layout, most
predictable distortion patterns (stamps, broker handwriting in known fields).
Success here proves the pipeline before tackling BOL marginalia.

**Resolved: ACORD 25 COI first.** ✅

---

### Q19: Template-based or distortion-augmented real forms?

**Question:** Generate forms from scratch, or take real blank forms and apply
distortions?

**Recommendation:** Hybrid. One real blank ACORD 25 PDF as primary template.
Render randomized data onto it. Apply distortion layers. Supplement with 2–3
template-based variants for layout diversity. Ground truth is exact — you
placed every field value. Target ~500–1,000 synthetic examples for initial
fine-tuning.

**Resolved: Hybrid (real blank + randomized data + distortion).** ✅

---

### Q20: Which distortion layers, and how applied?

**Question:** Real COIs arrive with multiple simultaneous problems. What
distortions to simulate? Applied independently or composited?

**Recommendation:** Composite application. Every training example gets 3–5
random distortions applied simultaneously with randomized severity. Order:
geometric first (rotation -5° to +5°, perspective warp), then photometric
(Gaussian blur, Gaussian noise, brightness/contrast, JPEG artifacts), then
overlays (ink stamp with random position/rotation/opacity, handwriting font
in annotation areas). The critical quartet for real-world freight COIs:
**rotation + blur + stamp + low resolution.** Also simulate: noise, skew,
contrast. Wrinkles/folds via elastic deformation in OpenCV if needed later.

**Resolved: Composite random distortions, 3–5 per example.** ✅

---

### Q21: What's the extraction output format?

**Question:** Qwen2-VL-7B fine-tuning needs a prompt→response format. JSON
structured, key-value text, or markdown table?

**Recommendation:** JSON structured. Drops directly into `extracted_fields`
JSONB column. Schema-validatable. Qwen2-VL-7B is capable of JSON output.
The token overhead is minimal relative to image tokens. Malformed JSON =
extraction failed, caught before human review.

Fine-tuning example format:
```json
{
  "image": "synthetic_coi_0001.png",
  "conversations": [
    {
      "from": "user",
      "value": "Extract the following fields from this ACORD 25 Certificate of Liability Insurance. Return JSON only.\n\nFields: insured_name, policy_number, policy_effective_date, policy_expiration_date, general_liability_each_occurrence, general_liability_aggregate, additional_insured_name, additional_insured_endorsement_date, handwritten_endorsements"
    },
    {
      "from": "assistant",
      "value": "{\"insured_name\": \"Acme Logistics Inc.\", \"policy_number\": \"CGL-2025-008842\", ...}"
    }
  ]
}
```

**Resolved: JSON structured output.** ✅

---

### Q22: Where do generation and training execute?

**Question:** Synthetic generation + fine-tuning is a batch job, not a
request-response API. Local workstation, Modal, Replicate, or RunPod?

**Recommendation:** Modal for everything — generation + training. Generation
script runs on Modal CPU (render form → populate fields → apply distortions →
save image + JSON). Fine-tuning runs on Modal GPU (load Qwen2-VL-7B → QLoRA →
save adapter). Inference endpoint on Modal GPU loads the adapter at cold start.
Same Python environment for all three. No local workstation, no SSH, no
separate platforms.

**Resolved: Modal for generation + training + inference.** ✅

---

### Q23: Full fine-tuning, LoRA, or QLoRA?

**Question:** Qwen2-VL-7B has 7B parameters. What fine-tuning method?

**Recommendation:** QLoRA. Runs on a single consumer GPU (RTX 4090 24GB or
RTX 3090) with 4-bit quantized base model. Adapter is 10–50 MB vs 14 GB for
full checkpoint. You're doing form-field extraction (domain adaptation), not
teaching vision from scratch. LoRA/QLoRA excels at this. The 1–3% accuracy
gap vs full fine-tuning can be compensated by generating more synthetic
examples (near-free) or later fine-tuning on real data.

**Resolved: QLoRA.** ✅

---

### Q24: How is the model evaluated before seeing real documents?

**Question:** You need to know the model works on unseen synthetic examples
before it touches a real COI. What metric and bar?

**Recommendation:** Field-level normalized match with critical-field weighting,
on a held-out 70/15/15 (train/val/test) split. Per-field weights for COI:
`policy_number`, `coverage_limit`, `additional_insured_name` = weight 3;
`policy_effective_date`, `policy_expiration_date` = weight 2; `insured_name`,
`broker_name`, `handwritten_endorsements` = weight 1. Target: weighted field
accuracy ≥ 85% on the test set before model graduates to shadow mode on real
documents.

**Resolved: Weighted field-level accuracy ≥ 85% on held-out test set.** ✅

---

### Q25: What tooling for synthetic generation?

**Question:** Programmatic form rendering + distortion. ReportLab, Pillow,
OpenCV, WeasyPrint?

**Recommendation:** Pillow + OpenCV. Start with one real blank ACORD 25 PDF
rasterized to high-res PNG as base template. Use Pillow to draw randomized text
at known field coordinates. Use OpenCV for geometric distortions (perspective
warp, rotation) and advanced photometric effects. Pillow handles stamp and
handwriting overlays. Output: PNG + JSON ground truth pair per example.

**Resolved: Pillow + OpenCV.** ✅

---

### Q26: Which fine-tuning framework and hyperparameters?

**Question:** HuggingFace Transformers, LLaMA-Factory, Axolotl, or Unsloth?

**Recommendation:** HuggingFace Transformers + PEFT + bitsandbytes directly.
Qwen's official team provides fine-tuning scripts for Qwen2-VL using this
exact stack. You're building a production pipeline that will be scripted on
Modal — direct Transformers code is easier to parameterize in a headless
script than a wrapper framework.

Starting hyperparameters (tune empirically):

| Parameter | Starting value | Notes |
|---|---|---|
| LoRA rank (r) | 16 | Sweet spot for domain adaptation |
| LoRA alpha | 32 | Standard 2× rank |
| LoRA target modules | `q_proj, v_proj, k_proj, o_proj` | Attention layers. Add MLP modules if underfitting |
| Learning rate | 2e-4 | Standard for QLoRA |
| Batch size | 4 (effective 16 w/ grad accumulation) | Fits in 24 GB VRAM w/ 4-bit base |
| Epochs | 3 | Monitor validation loss |
| LR scheduler | Cosine with 10% warmup | Standard |
| Max sequence length | 2048 tokens | JSON output for 10 COI fields < 512 tokens |
| Image resolution | 448×448 or 672×672 | Qwen2-VL native. Higher = more detail for small text |

**Resolved: HuggingFace Transformers + PEFT + bitsandbytes.** ✅

---

### Q27: How are datasets, checkpoints, and adapters versioned?

**Question:** Multiple dataset versions, multiple training runs. How to track
which dataset produced which model?

**Recommendation:** Modal Volumes + `manifest.json`. Directory convention:
`datasets/{dataset_id}/images/*.png`, `datasets/{dataset_id}/ground_truth.jsonl`.
`adapters/{run_id}/` for QLoRA weights. `manifest.json` at root records every
training run with dataset ID, base model, method, hyperparams, and evaluation
score. Inference endpoint reads manifest to find the latest adapter meeting the
≥85% bar for the requested document type.

**Resolved: Modal Volumes + manifest.json versioning.** ✅

---

## Synthetic fine-tuning pipeline summary

```
┌─────────────────────────────────────────────────────────────────┐
│                      Modal (Python)                              │
│                                                                  │
│  1. GENERATE (CPU, batch)                                       │
│     real_blank_coi.png → fill random data → apply distortions   │
│     → save image + ground_truth.json → split 70/15/15           │
│                                                                  │
│  2. TRAIN (GPU, batch)                                          │
│     load Qwen2-VL-7B (4-bit) → QLoRA → save adapter             │
│     → evaluate on test set → record in manifest.json            │
│                                                                  │
│  3. INFER (GPU, request-response)                               │
│     cold start: load base model + latest adapter from manifest  │
│     POST /extract { image, doc_type: "COI" } → JSON fields      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Q28: Qwen2-VL vs Qwen3-VL?

**Question:** Which base model for fine-tuning? Qwen2-VL-7B is stable today;
Qwen3-VL may be better when released.

**Recommendation:** Qwen2-VL-7B now. Re-evaluate Qwen3-VL when it ships.
The synthetic generation pipeline, training scripts, evaluation framework,
and Modal deployment are all model-agnostic. Porting to Qwen3-VL is a training
re-run with a different base model — not a rewrite. If Qwen3-VL releases later,
run it in shadow alongside Qwen2-VL and cut over using the same per-type
agreement rate gate (Q17).

**Resolved: Qwen2-VL-7B now. Qwen3-VL when it ships, same pipeline.** ✅

---

### Q29: Which loss function?

**Question:** Standard cross-entropy or domain-specific (weighted field-value
tokens, JSON-validity auxiliary loss)?

**Recommendation:** Standard cross-entropy. JSON structure is learned from
examples, not from a custom loss. QLoRA's constrained capacity means weighted
token losses risk over-indexing on values at the expense of learning extraction
patterns. Malformed JSON is caught downstream by the evaluation pipeline and
the ≥85% accuracy bar — no need to embed it in training. If malformed JSON is
a persistent problem, fix it with more synthetic examples or a simpler prompt,
not a custom loss function.

**Resolved: Standard cross-entropy.** ✅

---

### Q30: Confidence threshold for "unreadable — skip human review" per field?

**Question:** What confidence level gates a field as unreadable vs. suggested
to human review?

**Recommendation:** Empirically calibrated per-field thresholds from the held-out
test set, with two-tier routing. For each field, compute the confidence where
precision drops below 95% (suggest threshold) and where recall drops below 50%
(unreadable threshold). Route: ≥ suggest → normal human review; < suggest but
≥ unreadable → human review with "low confidence" flag; < unreadable → skip
human review, mark unreadable. Thresholds are recorded in `manifest.json`
alongside evaluation scores and loaded by the inference endpoint.

**Resolved: Empirically calibrated per-field, two-tier from test set.** ✅

---

### Q31: Exact `content_classification` enum values?

**Question:** What values does `content_classification` on `policy_documents` hold?

**Recommendation:** `digital`, `scan`, `mixed` — three values.
- `digital`: Born-digital PDF. Text extraction works. Vision not invoked unless
  confidence gating triggers.
- `scan`: Fully scanned document. Routes to vision path.
- `mixed`: Hybrid PDF. Page-level splitting: digital pages → text, scanned
  pages → vision. Document tagged `mixed`.
Granular categories (office_scan, photo, fax) are diagnostic metadata that can
be added later; routing only needs the three-way split.

**Resolved: `digital`, `scan`, `mixed`.** ✅

---

### Q32: Warmup steps as absolute number?

**Question:** Cosine LR scheduler warmup — how many steps?

**Recommendation:** 10% of total training steps. For 1,000 synthetic images,
70/15/15 split (700 train), effective batch 16 (4 × grad accum 4): ~44 steps
per epoch, 132 total across 3 epochs, warmup = 13 steps. Adjust proportionally
if dataset size changes. For QLoRA (99.9% weights frozen), warmup is less
critical than full fine-tuning — being off by factor of 2 won't meaningfully
change results.

**Resolved: 10% of total steps (~13 for 1K examples at batch effective 16).** ✅

---

### Q33: Minimum labeled examples per document type for cutover?

**Question:** How many real-world reviewed documents before the human agreement
rate comparison (Q17) is statistically meaningful?

**Recommendation:** Hybrid: minimum 30 real examples AND the lower bound of a
90% binomial confidence interval on Qwen's agreement rate exceeds GPT's
agreement rate. The 30-example floor prevents evaluating on noise. The
confidence interval prevents a lucky streak from triggering premature cutover.
At 100 examples the interval is tight. Computed as a SQL query against the
shadow tracking table from Q17.

**Resolved: ≥30 examples + 90% CI lower bound > GPT agreement rate.** ✅

---

### Q34: Migration numbers for new columns?

**Question:** What migration file numbers for `content_classification` and
`extracted_fields` on `policy_documents`?

**Resolved:** Next sequential number when this moves from backburner to active.
Latest migration is `0023`. Do not reserve numbers for backburner ideas.

---

## Context Injection Pivot — Grilling Session 2026-06-28

> The original Phase 2 plan was QLoRA fine-tuning of Qwen2-VL-7B on Modal.
> A follow-up grilling session (6 questions) pivoted Phase 2 to **context injection**
> (few-shot prompting + schema injection + golden example bank). Fine-tuning is now
> on standby — the 1,000 synthetic COI dataset is held in reserve.
>
> Rationale: Gemini's massive context window makes few-shot prompt injection
> a viable alternative to fine-tuning for domain-specific extraction, with zero
> training cost, instant adaptability, and no risk of catastrophic forgetting.

### Q35: Pivot or sequence — context injection now, fine-tuning later?

**Question:** Replace fine-tuning permanently with context injection, or deploy
context injection first and keep fine-tuning on standby?

**Recommendation:** Sequence. Context injection first (schema injection already
exists in `gemini-backend.ts`). Add few-shot examples and golden example bank.
Keep the 1,000 synthetic COIs as a fallback asset — if real-world accuracy
plateaus below 85% on critical COI fields, resume fine-tuning with a
ready-to-go dataset.

**Resolved: Sequence — context injection now, fine-tuning on standby.** ✅

---

### Q36: Where do golden few-shot examples come from?

**Question:** Few-shot needs known-correct (image, JSON) pairs. Staff-curated,
synthetic, or bootstrapped from corrections?

**Recommendation:** Staff-curated cold start + correction flywheel. Generate 5
clean synthetic COIs (no distortions), staff verifies JSON. Promote 3 to golden
examples. Then build a "promote to example" button so every staff correction
feeds the golden example bank. Synthetic COIs are too clean to teach the model
about real-world distortions — only use them for the verified cold start.

**Resolved: Staff-curated + correction flywheel.** ✅

---

### Q37: How many examples, and where stored?

**Question:** How many few-shot examples per request? New table or reuse
`policy_documents`?

**Recommendation:** 3 examples per document type. Stored in `policy_documents`
with `is_golden_example = true` flag + `image_base64` cached column. Three is
the sweet spot — enough pattern signal without meaningful cost impact (~$0.003–0.006
extra per request). Using the existing table means "promote to example" is a
single UPDATE — no new infrastructure.

**Resolved: 3 examples, `policy_documents` with flags.** ✅

---

### Q38: Static few-shot or RAG-powered retrieval?

**Question:** Inject the same 3 golden examples every time, or retrieve the
most similar examples via vector search?

**Recommendation:** Static few-shot now. RAG becomes valuable when the golden
example bank grows past ~20 examples and static injection starts picking
irrelevant examples. For the next 3–6 months (dozens of real COIs), static
is sufficient. RAG requires pgvector embeddings + similarity index — add when needed.

**Resolved: Static few-shot. RAG deferred until 20+ examples.** ✅

---

### Q39: How to cache example images — fetch from blob or pre-compute?

**Question:** Golden examples' images live in Vercel Blob. Fetch per request
(+200–500ms latency) or cache base64 at promotion time?

**Recommendation:** Cache base64 at promotion time in `image_base64` column.
When staff clicks "promote," the Server Action fetches the blob, encodes to
base64, and stores it. The Gemini backend reads golden examples with a single
DB query — no blob fetch latency per extraction request.

**Resolved: Cache base64 at promotion time.** ✅

---

### Q40: Implementation scope — what gets built now?

**Question:** Full context injection pipeline or incremental?

**Recommendation:** Build everything in one pass. The components are tightly
coupled: migration → golden example CRUD → few-shot prompt injection → promote
UI button → golden example seeding. Total scope: ~150 lines of new code +
one migration. The manual step (verifying 5 synthetic COIs) is the only
blocking human task.

**Resolved: Build all now. Manual: verify 5 golden COIs.** ✅
