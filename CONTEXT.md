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

### Attestation Authority
`policy_rulesets` is the **sole** attestation authority. A client attests to a ruleset; the ruleset transitions `draft → client_attested → active` (staff activation). The `policy_attestations` table was designed but never created — it is superseded by the ruleset lifecycle. The columns `attested_by`, `attested_at`, and `scope_statement` live on `policy_rulesets`.

### Gateway Tag Authority
`gateway_behavioral_tags` is the **sole** authority for gateway preventability tags. The denormalized columns on `"Audit Results"` (`"Gateway preventability"`, `"Gateway category"`, `"Gateway rule suggestion"`, etc.) are a legacy cache — read from the normalized table, not written to independently. All gateway tag review (confirm/edit/dismiss) goes through `gateway_behavioral_tags`.

### Document (not "Policy Document")
One piece of source evidence: a PDF, tariff, rider, SOP, or email. Append-only. The renewed 2026 contract is a new document row, never an edit of the 2025 one.

**Canonical table**: `policy_documents`.

### Ruleset (not "Policy Ruleset")
The version unit. A named, versioned collection of rules, `draft → active → archived`. Its `effective_from/to` is the sole authority on what rules were in force on a given date. Document and contract dates are descriptive metadata only. A new draft version is **additive** — it copies forward the prior active version's rules rather than replacing them — and the active version is immutable once attested; changes (including client-defined rules, ADR 0012 T4 / ADR 0014) enter the next draft, never the active ruleset.

**Canonical table**: `policy_rulesets`.

### Policy Intelligence
The module name only. Covers extraction, taxonomy, backtest, and readiness. "Policy" here means "the business domain of governing arrangements" — not the code tables that live under it.

### Gateway (Pre-Shipment)
The Gateway runs as a **separate Fastify service** (`services/gateway/`) importing the shared `lib/intelligence/policy-evaluator.ts` library. The evaluator is the same code (`mode: 'pre_shipment'` vs `mode: 'backtest'`); the runtime is a separate process for latency isolation, independent scaling, and different failure modes (fail-closed for high-value prechecks vs fail-open for backtests). The `/v1/precheck` endpoint calls the same evaluator function the backtest calls. See ADR 0016.

### Backtest (Post-Shipment)
A reproducible run of one ruleset against a historical period. Read-only over shipments, invoices, and audit results. Produces `policy_backtest_results` — one row per violated rule. Used for the "Linked Audit" and the Compliance Intelligence Package.

### Data Readiness
A pre-assessment diagnostic: per-field null-rate across a client's shipments, cross-referenced with which rules depend on each field. Surfaces "data capture is finding #1" when sparse. Priced as a standalone $500 Data Maturity Audit; the full $1,000 Compliance Risk Assessment requires sufficient data completeness to produce meaningful results.

## Facility Intelligence Terms

### Facility
The durable physical location that is the subject of a Facility Intelligence Dossier,
identified by its normalized street address and location. Operators, owners, brands,
and parent companies may change without creating a new Facility.

**Do not use**: "warehouse" when the evidence does not establish the site's function;
"3PL" or the current operator's name as a substitute for the physical place.

### Facility Relationship
A time-bounded association between a Facility and an organization, such as operator,
property owner, parent company, brand, certifying body, or known user. Evidence about
one organization is not automatically evidence about another past or present organization
at the same Facility.

### Facility Evidence Attribution
The strength of the demonstrated connection between a source record and a Facility:
`FACILITY_DIRECT`, `OPERATOR_DURING_TENURE`, `ENTITY_ONLY`, or `AREA_CONTEXT`.
Only direct evidence and carefully qualified operator-during-tenure evidence may support
a Facility assessment; the other classes are research leads, not Facility claims.

### Facility Match Candidate
A proposed association between a public source identity and a Facility, supported by
address, organization, and relationship evidence. It is not a confirmed match and cannot
support an externally delivered dossier until a human reviewer confirms it.

### Confirmed Facility Match
A Facility Match Candidate accepted by a human reviewer with the supporting and
contradictory evidence preserved. Automated confidence assists review but never confirms
or publishes a match by itself.

### Facility Research Brief
An internal research artifact containing confirmed evidence, unresolved leads, negative
searches, analyst hypotheses, and prospect-specific outreach context. It is not a client
deliverable and its unconfirmed contents cannot support external claims.

### Facility Intelligence Dossier
An externally shareable, point-in-time assessment of one Facility containing only
human-confirmed matches, cited assertions, relevant dates, disclosed methodology, and
limitations. It is distinct from the internal Facility Research Brief.

### Dossier-Assisted Outreach
A top-of-funnel sales motion in which a Facility-specific public-record signal earns a
conversation that leads toward Aurelian's shipment-data audit or compliance assessment.
The Dossier establishes relevance but is not initially sold as a standalone product or
treated as proof of future loss.

### Dossier Validation
The two-part test for Facility Intelligence: **evidence validation** asks whether confirmed,
relevant public signals exist; **commercial validation** asks whether Dossier-Assisted
Outreach produces substantive replies and shipment-data audit conversations. Finding
adverse records alone does not validate the sales motion.

### Procedural Posture
The verified legal or administrative state of an enforcement or litigation assertion:
`ALLEGED`, `AGENCY_CITED`, `CONTESTED`, `ADJUDICATED`, `SETTLED_NO_ADMISSION`,
`DISMISSED`, `WITHDRAWN_OR_VACATED`, or `STATUS_UNKNOWN`. A filing, allegation, citation,
settlement, and final finding are never interchangeable.

### Bounded Negative Search
A documented search that found no responsive record within named sources, queries,
coverage, and search date. It is not affirmative evidence that a Facility is safe,
compliant, or free of records elsewhere.

### Prospect–Facility Relationship
A separately evidenced, time-bounded association showing that a sales prospect uses or
used a Facility. It must be confirmed before outreach states or implies the relationship;
anonymous chatter and single-source inference are research leads only.

### Facility Source Record
A reproducible public-evidence object preserving the source authority, native identifier,
original identity fields, relevant dates and location within the source, retrieval details,
supporting content, and permitted snapshot or hash. A URL by itself is not a sufficient
Facility Source Record.

### Facility Signal
A human-reviewed interpretation of one or more Facility Source Records, characterized
separately by attribution strength, procedural posture, commercial relevance, and evidence
confidence. Facility Signals are not combined into a composite risk score during initial
validation.

### Facility Record Change
A newly observed, removed, or modified state of a Facility Source Record compared with a
previous retrieval. During initial validation, changes are checked manually and remain
review candidates until a human confirms their meaning and Facility attribution.

### Tier 1 Facility Review
The minimum comparable research scope completed for every initial Facility: identity and
relationship verification plus documented OSHA, federal litigation, and relevant Secretary
of State searches across known address and organization variants. Completion means the
search scope was performed and reviewed, not that adverse records were found.

### Corporate Context Record
A corporate filing used primarily to resolve organization identity, relationships, status,
and operator tenure. Corporate changes or secured financing are not adverse Facility Signals
unless their operational relevance is separately evidenced and explained.

### Soft Facility Lead
Unverified or weakly attributable material such as community chatter, anonymous reviews,
job postings, or search snippets used only to discover identities or authoritative records.
During initial validation it cannot appear in an external Dossier or corroborate another
Soft Facility Lead.

### Facility-Related Litigation
A court matter whose Facility connection, party role, procedural posture, and relevance to
cargo custody, operational compliance, insurance, shipping controls, or continuity have
been established. A docket hit or party name alone is not a Facility Signal.

### Facility-Relevant Enforcement
An agency record whose establishment, address, operator tenure, current posture, and
commercial relevance have been verified. An enforcement record may motivate a specific
operational question but does not prove unrelated cargo, insurance, billing, or compliance
failures.

### Audit Opportunity Note
A prospect-specific sales artifact that connects a prospect's confirmed Facility relationship
to recommended Aurelian shipment-data tests and an audit call to action. It remains separate
from the prospect-neutral, reusable Facility Intelligence Dossier.

### Facility Intelligence Validation Pack
The structured manual materials used for the first-ten experiment: identity and relationship
evidence, match reviews, source and negative-search registers, signals, internal and external
artifacts, and outreach outcomes. It remains outside the production application until both
evidence and commercial validation pass.

### Facility Location Identity
The immutable identity of a Facility is independent of any one address representation.
Normalized and raw addresses, coordinates, parcel or building identifiers, spatial scope,
and their effective dates are matching evidence attached to that identity.

### Site and Unit
A **Site** is a broader campus or parcel group that may contain multiple Facilities; a **Unit**
is a separately occupied subdivision within a Facility. When public evidence cannot resolve
the exact Site, Facility, or Unit, the Dossier discloses that spatial uncertainty.

### Evidence Propagation
Facility and organization relationships expand research scope but never transfer a Facility
Signal automatically between a Facility, operator, subsidiary, parent, owner, or neighboring
Unit. Every external assertion requires its own evidenced attribution path.

### Dossier Signal Window
The external Dossier normally presents Facility Signals from the preceding five years.
Older evidence may appear only when still operative, materially connected to current
conditions, part of a repeated pattern, or necessary to explain a current relationship;
the underlying history remains in the Research Brief.

### Dossier Publication Gate
The external Dossier method, template, disclaimer, retention practice, and standard outreach
language require counsel review before first use. Individual Dossiers containing materially
harmful, identity-uncertain, withdrawn, sealed, criminal, fraud, or cargo-theft allegations
require case-specific escalation before delivery.

### Dossier Correction
A versioned amendment issued after a source, match, posture, or assertion is shown to be
incorrect or materially incomplete. Private Dossiers provide a correction channel; disputed
material is suspended from reuse while reviewed rather than silently overwritten.

### Dossier Data Minimization
The rule that public availability alone does not justify collection or republication of
personal data. Research retains only identity details necessary for verification, and the
external Dossier omits personal information unless materially required to explain an
evidenced relationship.

### Shared Facility Intelligence
Public Facility identity, public relationships, confirmed Source Records, Signals, and
Dossier history that may be reused across research contexts without revealing who uses the
Facility.

### Confidential Facility Relationship
A client- or prospect-specific association with a Facility, including supporting ship-from
evidence, shipments, audit findings, scorecards, recommendations, outreach, and sales notes.
It is tenant-scoped and never disclosed through Shared Facility Intelligence.

### External Facility Context
Confirmed public Facility Signals shown separately from first-party operational compliance
and data confidence. External context cannot change a Warehouse Scorecard percentage or
activate a Gateway action; it may only prompt human review and a governed rule suggestion.

### Dossier Validation Cohort
The first ten Facilities selected and recorded before substantive adverse-record research,
using prospect fit, confirmed relationship, operational importance, reachability, audit
potential, and minimum source availability. Known-adverse positive controls are labeled
separately and do not count toward the cohort's evidence rate.

### Dossier Permission Sequence
The outreach sequence in which a neutral, posture-qualified Facility observation asks the
prospect for permission to receive the Dossier. Delivery and later audit conversion stages
are tracked separately; the Dossier is not attached to the first cold message.

### Audit-Only Baseline
A comparable outreach cohort or documented recent baseline using Aurelian's existing audit
offer without Facility Intelligence. It provides directional commercial context for the
Dossier experiment but is too small to establish causal conversion lift.

### Dossier Research Timebox
The first-ten cohort allows at most three analyst hours per Facility for identity verification,
Tier 1 research, review, drafting, and recheck. Unresolved evidence is excluded rather than
allowed to expand the experiment into deeper-source research.

## Agent Operations Terms

### Facility Research Copilot
The first Aurelian agent: a human-gated research assistant that proposes source queries,
Facility matches, evidence classifications, and draft dossier artifacts. It cannot confirm
matches, publish a Dossier, write governed production records, or send outreach.

### Agent Artifact
A versioned draft, assertion set, research result, or proposed action produced by an agent
for review. An Agent Artifact is not business truth until the relevant human or deterministic
governance workflow accepts it.

### Agent Tool Boundary
The narrow authenticated application interface through which an agent reads assignments and
submits candidates or artifacts. Agents do not access production Neon directly; Next.js owns
authorization, tenant scope, validation, idempotency, and governed persistence.

### Agent Job
A resumable asynchronous unit of agent work that produces candidates and Agent Artifacts,
then may pause in `awaiting_review` before deterministic acceptance. Agent Jobs do not run
inside long-lived user-facing HTTP requests.

### Audit Job vs Agent Job
An **Audit Job** runs deterministic financial processing and completes or fails; an **Agent
Job** performs bounded interpretive work that may pause for review, revision, approval, or
rejection. They may share queue mechanics but never share lifecycle authority or throughput.

### Root Copilot
The initial ADK topology: one narrowly instructed Facility Research Copilot using deterministic,
typed tools. Specialist sub-agents are introduced only when evaluation evidence shows a
genuinely separate role that the Root Copilot cannot perform reliably.

### Authoritative Source Adapter
A read-only, allowlisted, rate-limited tool that converts one named public source into typed
Facility Source Record candidates with full retrieval provenance. General web results may
produce Soft Facility Leads but cannot substitute for an Authoritative Source Adapter or
human source review.

### Aurelian Agent Service
The single initial ADK application boundary maintained under the Aurelian repository's
`agents/` area and deployed independently from Next.js. It begins with the Facility Research
Copilot; later copilots remain permissioned applications within this boundary until security,
scale, dependencies, or release cadence justify separate deployment.

### Agent Service Identity
The dedicated, expiring, machine-authenticated identity by which Next.js authorizes a bounded
Agent Job and the Agent Service invokes permitted application tools. Prompt content, user
cookies, ingestion secrets, and client API keys never grant agent authority.

### Copilot Capability Manifest
The server-enforced allowlist of tools, operations, tenant scope, assigned resources, and
valid job states for one copilot type. Copilots sharing the Agent Service do not share
authority, and prompt instructions cannot expand the manifest.

### Untrusted Agent Evidence
All public, retrieved, uploaded, emailed, or client-supplied content presented to an agent.
It may support analysis but can never alter instructions, permissions, tool scope, identity,
or execution policy; prompt-injection resistance is a required evaluated behavior.

### Agent Checkpoint
A compact typed snapshot of an Agent Job's confirmed inputs, current stage, pending reviews,
approved artifacts, and remaining work. ADK session state is temporary; checkpoints and
Agent Artifacts are Aurelian's durable memory rather than conversation transcripts.

### Agent Run Ledger
The durable metadata trail for an agent attempt: identities and versions, input and output
artifact hashes, tool activity, validation, cost, latency, review, retry, and disposition.
Full prompts and responses are restricted diagnostic material with explicit retention, not
ordinary logs or default durable memory.

### Engineering Agent
An authorized coding assistant such as Codex, Claude Code, or GitHub Copilot that may inspect,
edit, test, and review the repository within an explicit engineering task. Engineering authority
belongs to the governed workflow, not to a particular vendor.

### Operational Agent
An ADK copilot that performs assigned business work through its Capability Manifest and produces
reviewable artifacts. Operational Agents cannot modify source code, change deployment, grant
themselves tools, or repair their own runtime; they submit engineering issues instead.

### Independent Engineering Review
A review of a material code change performed in a fresh agent context that did not implement
the change, using the original specification, repository standards, and actual diff. Provider
diversity is optional; fresh-context challenge and deterministic verification are required.

### Material Engineering Change
A change that can affect business behavior, calculations, identity or tenant boundaries, data,
financial writes, deterministic decisions, agent authority, integrations, secrets, queues,
dependencies, infrastructure, or confidential information. Materiality follows consequence,
not diff size; uncertain changes are treated as material.

### Release Authority
The human authority to approve a material production deployment after reviewing its release
evidence. During the founder-led stage, the user holds Release Authority; neither an Engineering
Agent nor an Operational Agent may infer it from implementation or completion instructions.

### Agent Learning Loop
The offline, versioned process that converts human-reviewed work into approved examples,
evaluations, and candidate instruction, tool, workflow, or model changes. Candidate changes
must beat held-out evaluation thresholds and receive human promotion; production agents never
self-modify or learn directly from unreviewed outcomes.

### Agent Trust Level
The measured authority tier granted to a copilot for one narrow task, progressing from trainee
drafting toward reversible low-risk execution only after sufficient reviewed evidence. Publication,
financial authority, rule activation, disputes, sensitive messaging, and deployment remain human-gated.

### Agent Correction
A structured learning event preserving an agent's original proposal, the human-accepted result,
a controlled reason code, and an optional reviewer note. Rejections and material edits require a
reason code so recurring failures can become retrieval examples, evaluations, or workflow changes.

### Agent Promotion Gate
The lexicographic evaluation rule for a candidate agent version or Trust Level: truth, citation,
identity, security, privacy, prompt-injection, and human-authority requirements must pass without
regression before productivity, acceptance, latency, or cost improvements may be considered.

### Trainee Review
The initial Trust Level requiring human review of every identity match, external Source Record,
attribution, procedural posture, Signal, factual dossier assertion, and delivery. The first-ten
Facility experiment remains under Trainee Review and cannot reduce publication oversight.

### Agent Learning Scope
The permitted-use classification attached to every example or correction: `PUBLIC_SHARED`,
`AURELIAN_INTERNAL`, `TENANT_RESTRICTED`, or `TRAINING_PROHIBITED`. Tenant-confidential material
is excluded by default from cross-client retrieval, prompts, evaluations, tuning, and reinforcement
learning; de-identification does not by itself expand permission.

### Learning Example Revocation
The lineage-preserving invalidation of an approved example when its source or correction is
withdrawn, superseded, or proven wrong. Revocation removes the example from future retrieval and
datasets, identifies affected evaluations, agent versions, and Dossiers, and triggers correction
review without silently deleting history.

### Dossier Research Cap
The three-hour maximum analyst time for completing one ordinary first-cohort Facility review,
brief, Dossier, and factual check. Unresolved material is disclosed or excluded rather than
pursued beyond the cap, and actual time is part of validation.

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
