# Freight Audit — Domain Glossary

## Core Entities

### Shipment
The fundamental grain of the product. A single package movement from origin to destination, identified by a tracking number or PRO number. The thing being evaluated for billing correctness.

**Schema**: `"Shipments"` table. Linked from `"Invoices"."Shipment"` (text[] — multi-hop, no direct link from `"Audit Results"`).

### Invoice
A carrier billing record. One invoice may cover multiple shipments (fan-out). The source of truth for what was *billed*.

**Schema**: `"Invoices"` table. Contains `"Shipment"` text[] linking to covered shipments.

### Audit Result (aka Finding)
A single anomaly detected by an audit engine. Two types, stored in separate tables, joined by the shipment spine:

- **Billing finding** — carrier overcharge: dimensional weight, fuel surcharge, accessorial padding. Stored in `"Audit Results"`.
- **Insurance finding** — coverage violation: wrong carrier, missing signature, exceeded declared-value limit. Stored in `shipment_insurance_audit_results`.

**Schema**: `"Audit Results"` (billing), `shipment_insurance_audit_results` (insurance). The "Linked Audit" queries both via `"Shipments"` left-joins, producing a unified `ShipmentPolicyContext` per ADR 0001. Missing: direct `shipment_id` on `"Audit Results"`.

### Dispute
A formal challenge to a carrier on one or more audit results. Tracks the full lifecycle
through a constrained state machine (ADR 0005):

```text
pending_review → filed → carrier_responded → won | dismissed | partial
                       partial → won (accepted) | appealed
                       appealed → carrier_responded
                       any → closed (human override)
```

**Schema**: `"Disputes"` table. Links: `"Invoice"` text[], `"Audit result"` text[].

### Client
The party being audited — typically a shipper. Holds the contract with the carrier.

**Schema**: `"Clients"` table. Tenancy scope: business tables are being migrated
from `text[]` arrays to scalar `client_id` (ADR 0006). A row belongs to exactly
one client.

### Carrier
The transportation provider being audited. Identified by SCAC code.

**Schema**: `"Carriers"` table. SFTP config per carrier.

### Ingestion Source
One of five canonical entry points for data into the platform:

| Source | Raw Input | Normalized Output |
|---|---|---|
| `carrier_api` | Carrier invoice JSON | `"Invoices"` row via `stageInvoice()` |
| `edi_210` | EDI 210 transaction | `"Invoices"` row via `stageInvoice()` |
| `wms_csv` | Client WMS export | `"Shipments"` row via `stageShipment()` |
| `3pl_api` | 3PL fulfillment/storage feed | `tpl_fulfillment_lines` / `tpl_storage_lines` |
| `sftp_poll` | Carrier SFTP file | `"Invoices"` rows per file via `stageInvoice()` |

### Normalization
The step between INGESTION and AUDIT ENGINE. A source-specific adapter transforms raw
payload into a canonical staging row — the audit engine never touches raw payloads.
Code mapping (`learned_mappings`) resolves carrier-specific codes to platform codes;
the data clerk AI proposes mappings for unknown codes (suggest-only, invariant 4).

### Ingestion Batch
A lineage record grouping ingestion records from one source event. Tracks file name,
row count, staged count, error count, and final status (`completed`, `partial`, `failed`).

**Schema**: `ingestion_batches` + `ingestion_records`.

### Code Mapping
The resolution of carrier-specific codes to platform-standard codes. Lifecycle:

```text
UNMAPPED (exception created) → AI_PROPOSED (data clerk suggests code)
→ HUMAN_CONFIRMED (analyst confirms) → LEARNED (mapping upserted, exception resolved)
```

Two tables:
- `ingestion_exceptions`: tracks the full journey. `status`: `open`, `ai_proposed`, `human_confirmed`, `learned`.
- `learned_mappings`: the confirmed mapping result. Created via idempotent upsert when an exception reaches `learned`. Authored by `HUMAN_ANALYST` or `AI_SUGGESTED` (after human confirmation).

The data clerk AI proposes mappings; humans confirm (invariant 4).

### Audit Job
A unit of work in the Postgres-backed job queue (`audit_jobs` table). Job types:
`parcel`, `3pl`, `data_clerk`, `sftp_fetch`. Statuses: `queued → running → completed | failed`.
Claimed via `FOR UPDATE SKIP LOCKED`. Only one job per `(job_type, client_id)` may be
running at once. Job status answers "did the run finish?" — for `data_clerk`, human review
of AI proposals lives in `ingestion_exceptions.status`, not in the job record.

## Resolved Terminology

### Audit Engine (Operational)
The legacy parcel and 3PL engines that produce `"Audit Results"` rows. Drive carrier
billing disputes and cash recovery. Use the `rulebook` table. Post-shipment only.

### Policy Evaluator (Strategic)
The new evaluator that reads `policy_rules` and produces `policy_backtest_results`.
Drives readiness assessments and the gateway precheck. Runs in `mode: 'backtest'`
or `mode: 'pre_shipment'`.

**Key distinction** (ADR 0007): two engines, two purposes, one shipment spine. The
operational engines recover money today; the strategic evaluator prevents loss tomorrow.
The Linked Audit (ADR 0001) joins both via `"Shipments"`.

### Rule (not "Policy Rule")
An evaluable condition the audit engine or gateway runs. Has `condition_json` (IF) and `action_json` (THEN). This is the atomic unit of evaluation.

**Canonical table**: `rulebook` (legacy audit engine). New structured rules use `policy_rules` (policy-intelligence) — migration toward one table is desired but not yet executed.

**Do not use**: "policy" to mean a rule. A rule evaluates; a contract governs.

### Contract (not "Client Policy")
A governing arrangement between a client and a carrier, 3PL, or insurer. The stable container — not a version. A renewal adds a new document and ruleset under the same contract; it does not create a new contract.

**Canonical table**: `client_policies` (name retained for schema stability; semantically a contract).

**Do not use**: "policy" to mean a contract. "Policy" survives only at the module level (Policy Intelligence).

### Document (not "Policy Document")
One piece of source evidence: a PDF, tariff, rider, SOP, or email. Append-only. The renewed 2026 contract is a new document row, never an edit of the 2025 one.

**Canonical table**: `policy_documents`.

### Ruleset (not "Policy Ruleset")
The version unit. A named, versioned collection of rules, `draft → active → archived`. Its `effective_from/to` is the sole authority on what rules were in force on a given date. Document and contract dates are descriptive metadata only. A new draft version is **additive** — it copies forward the prior active version's rules rather than replacing them — and the active version is immutable once attested; changes (including client-defined rules, ADR 0012 T4 / ADR 0014) enter the next draft, never the active ruleset.

**Canonical table**: `policy_rulesets`.

### Policy Intelligence
The module name only. Covers extraction, taxonomy, backtest, and readiness. "Policy" here means "the business domain of governing arrangements" — not the code tables that live under it.

### Gateway (Pre-Shipment)
Not a separate service. The Gateway is a **mode** of the existing `evaluatePolicyContext()` evaluator: `mode: 'pre_shipment'` vs `mode: 'backtest'`. It runs as an API route in the Next.js app (not a separate Fastify runtime), reading the same Postgres `policy_rules` source as the backtest. The `/v1/precheck` endpoint calls the same function the backtest calls.

### Backtest (Post-Shipment)
A reproducible run of one ruleset against a historical period. Read-only over shipments, invoices, and audit results. Produces `policy_backtest_results` — one row per violated rule. Used for the "Linked Audit" and the Compliance Intelligence Package.

## Portal Governance Terms

### Recovery Tab
The existing post-shipment billing audit dashboard in the client portal. Shows recovered dollars, active disputes, win rate, surcharge breakdown, recovery pipeline, carrier rankings, and recent activity. Answers "what did we recover?" Audience: CFO, accounts payable.

**Data source**: Disputes, Invoices, Audit Results via AirTable (`fetchRecords` scoped by `clientId`).

### Compliance Tab
The new governance dashboard in the client portal. Shows insurance compliance, warehouse SOP scores, carrier authorization rates, and gateway readiness. Answers "are we exposed right now?" Audience: risk manager, compliance officer.

**Data source**: SQL-backed report functions (`getInsuranceExposureReport()`, `getGatewayReadinessReport()`, `getTopGatewayRuleSuggestions()`). Separate data layer from Recovery tab.

### Coverage Gap Feed
The primary detailed view in the Compliance tab. A chronological list of specific shipments that violated insurance or contract requirements — each showing shipment ID, date, lane, declared vs. actual value, violated clause, and estimated uninsured exposure in dollars. Filterable by warehouse, carrier, violation type, and date range. Answers "which shipments are exposed?"

### Warehouse Scorecard
A secondary panel below the Coverage Gap Feed. A per-fulfillment-center compliance table: each warehouse is a column, each SOP is a row (packaging, signature, declared value, carrier selection, insurance class), cells show compliance % with color coding (green ≥95%, yellow ≥85%, red <85%) and 30-day trend arrows. Highlights the "Worst Offender" warehouse at the top. Answers "are my fulfillment centers following the rules?"

### Attestation
The client's formal acknowledgment of their insurance requirements, carrier authorizations, and SOPs. An Attestation panel on the Compliance tab shows the client's current attested policies, a "Pending Attestations" count, and an attestation workflow where the client reviews extracted rules from uploaded policy documents, signs off, and the system records the attestation timestamp + version. Makes every future coverage gap a "you attested, then violated" event. Anchors governance accountability. Attestation proves *acknowledgment*, not correctness: a client-authored rule (ADR 0012 T4 / ADR 0014) is gated behind a staff correctness review (ADR 0015) before it is attestable — the client never enforces a rule on the strength of attesting their own definition.

### Gateway Readiness Summary (Client-Facing)
A "What You Would Have Saved" panel on the Compliance tab. Shows total preventable exposure in dollars across the period, with a simulation toggle (Advisory / Require Approval / Block) to show how the numbers change under each gateway mode. Lists "Top N Rules to Activate" ranked by dollar impact. Proves gateway value without exposing raw taxonomy labels or self-serve configuration. Actual gateway activation remains staff-controlled until rulesets are validated with the first 3–5 clients.

### Portal Data Loader
A unified server-side data fan-out that the Compliance tab calls. Runs SQL-based report functions (`getInsuranceExposureReport`, `getGatewayReadinessReport`, `getTopGatewayRuleSuggestions`) in parallel with AirTable-based Recovery queries. Makes the hybrid data layer invisible to UI components. Returns a single `{ recovery, compliance }` payload for the dual-tab dashboard.

### Multi-Type Document Upload
The Upload page expanded beyond CSV shipments. Supports document type selection: Insurance Policy, Carrier Contract, SOP, Claims History, Shipment CSV. Each type routes to the appropriate pipeline — policy documents feed AI extraction → attestation queue; CSVs feed ingestion pipeline; claims feed dispute evidence. Upload shows processing status ("Extracting rules from Zurich Policy.pdf… 3 rules found, 2 confirmed, 1 needs review"). Clients self-serve their governance data on-ramp.
