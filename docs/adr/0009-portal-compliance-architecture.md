# ADR 0009 — Portal Compliance Architecture

- **Status**: ACCEPTED
- **Date**: 2026-06-26
- **Deciders**: Controller (grilling session with docs)
- **Context**: ADR 0007 (Dual Audit Architecture), 05-readiness.md, portal.md, policy-intelligence/03-taxonomy.md

## Context

The client portal today is a post-shipment recovery dashboard — recovered dollars, dispute status, surcharge breakdown. It answers "what did we recover?" but it does not answer "are we exposed right now?" For high-value goods shippers (jewelry, fine art, watches), the governance question — insurance compliance, carrier authorization, SOP adherence, gateway readiness — is as critical as the financial recovery question.

The Policy Intelligence module (ADR 0007) already produces the data needed to answer governance questions: `shipment_insurance_audit_results` (coverage violations), `policy_backtest_results` (rule violations), `"Audit Results"` gateway metadata (preventability tags, estimated savings). But none of this surfaces in the client portal. The Compliance Intelligence Package (05-readiness.md) has a fully designed Audit→Diagnosis→Cure spine with zero portal surface area.

This ADR covers 9 architectural decisions made during a grilling session focused on the client portal as a governance platform for high-value goods shippers.

---

## Decision 1: Dual-Mode Dashboard (Recovery + Compliance tabs)

**Decision**: The portal Dashboard becomes a dual-tab page — "Recovery" (the current billing audit dashboard) and "Compliance" (a new governance dashboard). Two audiences within the same client: CFO looks at Recovery, risk manager looks at Compliance. Merging them into one page would dilute both. The sidebar stays unchanged — "Dashboard" opens to the Recovery tab by default, with a "Compliance" tab alongside it.

**Consequences**:
- Two distinct data-loading paths on the same page (parallel fetches), but the UI stays simple.
- No new sidebar items — zero disruption to existing users.
- Each tab owns its own data layer: Recovery stays on AirTable, Compliance uses SQL report functions.
- Future gateway activation is a "check the Compliance tab" story, not a "learn a new product" story.

**Alternatives considered**: Two separate nav items (creates cognitive load — "which one do I use?"); single merged dashboard (dilutes both audiences — the CFO doesn't need signature compliance rates, the risk manager doesn't need surcharge breakdowns).

---

## Decision 2: Five Governance KPIs on Compliance Tab

**Decision**: Five KPI cards at the top of the Compliance tab, each backed by SQL data:

| KPI | Source | Question It Answers |
|-----|--------|---------------------|
| **Uninsured Exposure** | `shipment_insurance_audit_results` | Total declared value gap (rolling 30d) |
| **SOP Compliance** | `policy_backtest_results` (SOP rules) | % of shipments where packaging/signature SOPs were followed, across warehouses |
| **Carrier Authorization** | `policy_backtest_results` (carrier rules) | % of shipments on approved-carrier-only lanes |
| **Signature Compliance** | `shipment_insurance_audit_results` | % of high-value shipments with required signature confirmation |
| **Gateway Readiness** | `"Audit Results"` gateway metadata | % of shipments that would pass a gateway precheck today |

Each KPI shows a 30-day trend arrow.

**Consequences**: These five metrics are client-facing governance language, not internal taxonomy labels. They answer the risk manager's question directly: "are we exposed?" None exist in the portal today. All five are backed by data we already have. The Gateway Readiness KPI is a simulation, not a claim — it uses the same `evaluatePolicyContext('backtest')` function the backtest uses.

**Alternatives considered**: Staff-operational metrics (code mappings, taxonomy candidates, backtest runs — meaningless to a risk manager); carrier performance metrics (already on the Recovery tab, not governance).

---

## Decision 3: Coverage Gap Feed as Primary Compliance Detail View

**Decision**: Below the KPI row, the primary detailed view in the Compliance tab is a Coverage Gap Feed — a chronological list of specific shipments that violated insurance or contract requirements. Each row shows: shipment ID, date, lane, declared vs. actual value, violated clause, estimated uninsured exposure in dollars. Filterable by warehouse, carrier, violation type, and date range.

**Consequences**: The risk manager sees *which* shipments are exposed *right now* and can drill into each one. This is the most actionable view — it tells you where to fix. The feed is the "Diagnosis" leg of the Audit→Diagnosis→Cure spine.

**Alternatives considered**: Rule violation summary aggregated by gateway category (internal-facing, better suited for staff console); no detailed view at all (leaves the KPIs without a "why").

---

## Decision 4: Warehouse Scorecard as Secondary Panel

**Decision**: Below the Coverage Gap Feed, a Warehouse Scorecard shows per-fulfillment-center compliance: each warehouse is a column, each SOP is a row (packaging, signature, declared value, carrier selection, insurance class), cells show compliance % with color coding (green ≥95%, yellow ≥85%, red <85%) and 30-day trend arrows. A "Worst Offender" row sits at the top.

**Consequences**: The risk manager can compare warehouses at a glance and see *which SOP* is failing at *which warehouse*. This is a board-level governance metric — SOP drift at a specific warehouse is a liability that can't be hidden in an aggregate.

**Alternatives considered**: Warehouse leaderboard with aggregate % only (hides the SOP detail — doesn't tell you *what's* broken); time-series chart (hides warehouse-to-warehouse comparison and loses the "worst offender" callout).

---

## Decision 5: Gateway Readiness "What You Would Have Saved" Summary

**Decision**: The Compliance tab includes a Gateway Readiness panel showing a single compelling number ("$847K in preventable exposure across 312 shipments this quarter"), a simulation toggle (Advisory / Require Approval / Block) that shows how the numbers change under each gateway mode, and a "Top 5 Rules to Activate" list ranked by dollar impact. This is powered by `getGatewayReadinessReport()` and `getTopGatewayRuleSuggestions()` from `lib/intelligence/reports.ts`.

**Consequences**: This proves gateway value without letting clients self-configure (premature — gateway rules aren't validated with the first 3–5 clients yet, per 05-readiness.md safety rule). The toggle is a simulation of what *would* have happened. Actual gateway activation stays staff-controlled until rulesets are validated. This is the "Cure" leg of the Audit→Diagnosis→Cure spine.

**Alternatives considered**: Full self-serve gateway configuration page (premature — rulesets unvalidated, risk of client misconfiguration); consulting-only PDF deliverable (hides value behind a human sales cycle — loses the portal as conversion engine).

---

## Decision 6: Hybrid Data Layer (Recovery on AirTable, Compliance on SQL)

**Decision**: The Compliance tab uses a hybrid data layer. The Recovery tab stays on AirTable (`fetchRecords` on Disputes, Invoices, Audit Results — it works, it's tested). The Compliance tab calls existing SQL report functions (`getInsuranceExposureReport()`, `getGatewayReadinessReport()`, `getTopGatewayRuleSuggestions()`) directly via a `portalDataLoader()` server action that fans out to both sources and returns a unified `{ recovery, compliance }` payload.

**Consequences**: Compliance data never lived in AirTable and shouldn't be forced there — it's native Postgres analytical data. Zero migration risk to existing Recovery queries. The dual-source is invisible to UI components. Migrating Recovery to SQL is a separate, high-risk project deferred intentionally.

**Alternatives considered**: Replicate compliance data into AirTable nightly (adds sync lag, complexity, and a new failure mode); migrate entire portal to SQL (high risk, zero business payoff right now — Recovery works fine on AirTable).

---

## Decision 7: Attestation Panel on Compliance Tab

**Decision**: The Compliance tab includes an Attestation panel — a sidebar card showing the client's current attested policies ("Insurance Policy: $100K declared value per shipment, attested Q2 2026"), a "Pending Attestations" count ("2 policies updated, awaiting your review"), and an attestation workflow. The client reviews extracted rules from uploaded policy documents, signs off, and the system records the attestation timestamp + version. Every future coverage gap becomes a "you attested, then violated" event.

**Consequences**: The portal isn't just showing problems — it's showing commitments. Attestation is the governance anchor: it makes the client accountable before violations are found. Pending attestations surface as a KPI-adjacent alert so they aren't buried in Settings.

**Alternatives considered**: Attestation buried in Settings page (zero visibility — nobody checks it); staff-only attestation (breaks the self-serve governance model — the client owns their policies).

---

## Decision 8: Multi-Type Document Upload

**Decision**: The Upload page expands from CSV-only to multi-type document intake. File upload with type selector: Insurance Policy, Carrier Contract, SOP, Claims History, Shipment CSV. Each type routes to the appropriate pipeline: policy documents → AI extraction → attestation queue; CSVs → ingestion pipeline; claims → dispute evidence. Upload history and processing status are visible ("Extracting rules from Zurich Policy.pdf… 3 rules found, 2 confirmed, 1 needs review").

**Consequences**: The Upload page becomes the client's governance data on-ramp. Policy documents are the source of truth for attestation — the client should own that flow, not the staff. Processing status gives visibility into the extraction pipeline without exposing internal AI details.

**Alternatives considered**: Keep upload CSV-only, add document upload in Settings (splits the intake funnel — CSV in Upload, documents in Settings — confusing); staff-only document upload (breaks self-serve — clients can't update their own policies without calling Aurelian).

---

## Decision 9: Dashboard as Dual-Tab Page

**Decision**: The sidebar nav item "Dashboard" opens to the Recovery tab (default), with a "Compliance" tab alongside it on the same page. No new nav items. Disputes, Invoices, Upload, Reports, Settings stay as standalone pages.

**Consequences**: Zero navigation disruption. Current users see the same Recovery dashboard on click. The Compliance tab is a discovery path inside the page they already use. As gateway adoption grows, the default tab could flip to Compliance, but that's a future decision.

**Alternatives considered**: Two separate nav items ("Recovery" and "Compliance") — adds cognitive load and splits the mental model of "dashboard"; "Dashboard" absorbs all pages (overloaded — Disputes and Invoices deserve their own deep-work surface).

---

## Consequences Summary

| Dimension | Impact |
|-----------|--------|
| **Data layer** | Hybrid: AirTable (Recovery) + SQL (Compliance). No migration risk. |
| **Portal UX** | One new tab on Dashboard, no new nav items. Five governance KPIs + Coverage Gap Feed + Warehouse Scorecard + Attestation + Gateway Readiness. |
| **Product surface** | The full Audit→Diagnosis→Cure spine now has a client-facing home. |
| **Gateway safety** | Simulation-only in portal. Activation stays staff-controlled until rulesets validated with first 3–5 clients. |
| **Attestation** | Client owns their policy commitments. Coverage gaps become "you attested, then violated." |
| **Upload** | Expands from CSV-only to 5 document types. Self-serve governance data on-ramp. |

## Implementation Phases (Controller Roster)

Wave C — Compliance Tab Buildout:

- **Phase 0 (blocking)**: E4 — Compliance Tab page shell + portalDataLoader + tab routing
- **Phase 1 (parallel)**: E5 — KPI row + Coverage Gap Feed + Warehouse Scorecard ∥ E6 — Gateway Readiness panel + Attestation panel
- **Phase 2 (sequential)**: E4 — Multi-type Upload page rebuild
