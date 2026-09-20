# Policy Intelligence — Ingestion

> This is **policy document** intake, which is distinct from shipment/invoice ingestion.
> Shipment ingestion answers *"what happened?"*; policy intake answers *"what should
> have happened?"* For the shipment pipeline see [`../ingestion.md`](../ingestion.md).
> Policy document intake must **never block** regular invoice/shipment ingestion —
> missing policy data surfaces later as a readiness gap, not an ingestion failure.

## Trust and scope

**Staff-only.** Every intake action runs through `requireStaff()`. Policy Intelligence
is the consulting handover — the client does not program the software, we do. Clients
never author or upload their own policy documents/rules in the MVP; the portal stays
read-only on policy (a client may *see* their readiness summary, not edit it).
Revisit self-serve only after the gateway productizes.

This staff-only boundary also keeps the AI-extraction trust surface narrow — see the
suggest-only boundary in [`02-extraction.md`](02-extraction.md#trust-boundary).

## Source document types (MVP)

- carrier contract
- carrier tariff guide
- 3PL SLA
- insurance policy or rider
- claims instruction
- shipping SOP
- packaging standard
- email exception / one-off approval

## Document storage — keep the bytes

`policy_documents` stores the original file, not just extracted text. These are
**compliance documents**: when a claim is denied and the question is "what did the
policy actually say," `raw_text` is our notes, the original PDF is the evidence. Storing
the blob also makes **re-extraction** possible (better prompt, corrected document type,
a missed clause) — which the suggest-only workflow guarantees will happen.

| Field | Role |
|-------|------|
| `storage_key` | Object-storage reference to the original file (source of truth) |
| `checksum` | sha256 of the original, for dedupe and tamper-evidence |
| `raw_text` | Extracted text — a **derived cache**, re-derivable from the blob |
| `source_url` | External link when the file lives in the client's system and we did **not** take custody |

> Status: `storage_key`/`checksum` are the intended shape. If the live table only has
> `raw_text` + `source_url`, treat adding the blob columns as the first migration before
> AI extraction ships. Tracked in [`../BACKLOG.md`](../BACKLOG.md).

## What a document carries

client • policy/document type • file name or source URL • effective dates • source owner
• extraction status (`not_started`, `extracted`, `reviewed`, `needs_review`) • extracted
raw text when available • analyst summary • uploaded/reviewed by.

## Effective-dating and renewals

Three tables carry `effective_from/to`, but **only the Ruleset's window governs
evaluation.** The renewal scenario (a 2026 insurance policy supersedes 2025):

| Entity | What happens |
|--------|--------------|
| `client_policies` | Unchanged. It is the stable container, not a version. |
| `policy_documents` | **New append-only row** for the 2026 PDF. The 2025 doc is never edited or deleted — it remains the evidence for 2025 shipments. |
| `policy_rulesets` | **New version** (`v2`), reviewed and activated; `v1` gets `archived_at` set. |

Rule that keeps backtests correct: a shipment is evaluated against the ruleset **in
force on its ship date**, not the latest one. Active rulesets for a client must not
overlap in `[effective_from, effective_to)`. See
[`04-backtest.md`](04-backtest.md#effective-dated-ruleset-selection) — the current
backtest runner does **not** yet honor this and is a known gap.

## Historical data: claims as ground truth

Step 1 of the pipeline gathers governing documents **and** 12–24 months of history. They
come from different places:

- **Invoices / shipments** — reuse the existing pipeline (`stageInvoice`,
  `"Audit Results"`). No new ingestion path; the backtest already reads these.
- **Denied insurance claims** — a **new, first-class source**, not notes. The entire
  Linked-Audit moat ("you lost $1,200 because USPS was used on a >$1,000 item") depends
  on real claims history. Without it, readiness numbers are projections; with it, they
  are evidence. Model as an `insurance_claims` table (claim date, shipment ref, carrier,
  declared/claimed/paid/denied amount, denial reason, `policy_id`). MVP ingestion =
  manual staff entry / CSV — denied claims are rare, low-volume events that arrive as
  PDFs/emails from the insurer.

> If claims are out of scope for the first milestone, say so loudly: the sales narrative
> cannot ship without them. Tracked in [`../BACKLOG.md`](../BACKLOG.md).

## Shipment metadata to capture (for the gateway layer)

Capture when available from WMS, carrier APIs, 3PL files, client uploads, or policy docs.
Do **not** block ingestion on a missing field — stage the record and let downstream
audit/gateway taxonomy mark `DATA_REQUIRED` / `DOCUMENTATION_MISSING`. Field list and the
vertical-specific items live in [`03-taxonomy.md`](03-taxonomy.md#shipment-fields-the-taxonomy-consumes).

## Extraction flow

```text
upload/source reference -> store blob -> extract text -> classify document
-> suggest clauses -> analyst reviews -> structured policy_rules -> draft ruleset -> backtest
```

The clause-to-rule half of this flow is detailed in [`02-extraction.md`](02-extraction.md).
