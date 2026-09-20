# Portal and Console UI

## Design System

The app has two related UI modes:

- **Staff console**: dense, operational, table-first, optimized for repeated audit/recovery work.
- **Client portal**: calmer, premium-fintech density, scoped to one client and focused on status, uploads, reports, and trust.

## Staff Console Design

- Dark theme, Hanken Grotesk body, JetBrains Mono data.
- OKLCH color system: green for recovery/success, amber for urgency, blue for info, hot/red for critical.
- Shared primitives live in `components/ui/primitives.tsx`.
- Design tokens live in `app/globals.css`.
- Tables should remain dense and scannable. Avoid marketing-style hero layouts inside operational tools.

## Client Portal Design

- Near-black background, translucent surfaces.
- Indigo action color, green recovered value, red disputed value.
- 220px persistent sidebar on desktop.
- Mobile (<=900px) uses 56px header and off-canvas nav.
- Tables use horizontal scroll on narrow screens, not card lists.
- Portal queries always scope by `session.user.clientId`. Never expose a client selector in portal.

## Console Pages

| Page | Route | Data Source |
|------|-------|-------------|
| Today dashboard | `/` | Audit Results + Disputes |
| Audit queue | `/queue` | Audit Results (FLAGGED/ERROR) |
| Disputes | `/disputes` | Disputes + Clients + Audit Results |
| Engine | `/engine` | Clients + audit_runs + dispute_outcomes |
| Ingestion | `/ingestion` | Invoices + Shipments + Audit Results + exceptions + jobs + upload logs + 3PL staging |
| 3PL ingestion | `/ingestion/3pl` | tpl_fulfillment_lines + tpl_storage_lines + clients |
| Exceptions | `/ingestion/exceptions` | ingestion_exceptions |
| Rulebook | `/rulebook` | rulebook + clients + carriers |
| Carriers | `/carriers` | Carriers |
| Clients | `/clients` | Clients |
| Users | `/users` | app_users + Clients |

## Ingestion Control Panel

Route: `/ingestion`

Expected surfaces:

- pipeline KPI strip;
- run pipeline jobs (`parcel`, `3pl`, `data_clerk`, `sftp_fetch`);
- file staging for WMS and 3PL CSV;
- typed/pasted intake for SFTP, carrier API JSON, WMS webhook JSON, raw EDI, and LTL CSV;
- recent intake events;
- job queue;
- unmatched invoices;
- unlinked WMS shipments;
- open mapping exceptions;
- 3PL cycle overview;
- recent staged invoice state.

This is a staff control plane over existing ingestion logic, not a second ingestion engine.

## Gateway Readiness UI Direction

Add staff-only surfaces after the schema/engine metadata exists:

- Gateway taxonomy filters on Queue and Audit Results.
- Gateway rule suggestion review panel.
- Gateway readiness report by client/month/category.
- Preventable margin loss summary.
- Top pre-shipment rule suggestions.
- Insurance exposure report for jewelry clients.
- Policy rule editor or structured onboarding workflow.

Do not expose raw gateway taxonomy editing to client users until the taxonomy has review controls and clear messaging.

## Policy Intelligence MVP UI

> UI specifics only. The concern's model, workflow, taxonomy, and schema live in
> [`policy-intelligence/`](policy-intelligence/README.md); client-facing report framing is
> in [`policy-intelligence/05-readiness.md`](policy-intelligence/05-readiness.md).

Policy Intelligence should start as staff-only console tooling. It is a consulting workbench first, then a gateway configuration surface.

Recommended staff routes:

| Page | Route | Purpose |
|------|-------|---------|
| Policies | `/policies` | Client policy inventory, status, effective windows |
| New policy | `/policies/new` | Create policy shell and attach source metadata |
| Policy detail | `/policies/[policyId]` | Documents, extracted clauses, notes, lifecycle |
| Policy rules | `/policies/[policyId]/rules` | Structured condition/action rule editor |
| Backtests | `/policies/[policyId]/backtests` | Historical policy evaluator runs |
| Readiness assessment | `/gateway-readiness/[clientId]` | Sales/consulting report from audit + policy + insurance data |

Required controls:

- client selector only in staff console;
- ruleset status badge: draft, active, archived;
- document extraction status: not started, extracted, needs review, reviewed;
- rule review controls: approve, edit, archive;
- backtest run button with period selector;
- assessment summary with preventable loss, uninsured exposure, top rules, and recommended controls.

Do not put raw PDF text or private policy terms in the client portal during MVP. Client-facing reports should translate policy intelligence into plain business outcomes:

- margin lost to preventable choices;
- uninsured or underinsured exposure;
- top operational rules to enforce;
- recommended gateway rollout mode.

## Client Portal Pages

| Page | Route | Data Source |
|------|-------|-------------|
| Dashboard | `/portal` | Recovery tab: Client + Disputes + Invoices + Audit Results (AirTable). Compliance tab: `portalDataLoader()` → SQL report functions |
| Disputes | `/portal/disputes` | Disputes + Audit Results |
| Invoices | `/portal/invoices` | Invoices + Audit Results |
| Upload | `/portal/upload` | Multi-type upload form: Insurance Policy, Carrier Contract, SOP, Claims History, Shipment CSV |
| Reports | `/portal/reports` | Disputes + Invoices aggregated by month |
| Settings | `/portal/settings` | Placeholder |
| Help | `/portal/help` | Placeholder |

### Dashboard: Dual Tabs

The Dashboard page (`/portal`) has two tabs:

1. **Recovery (default)** — The existing billing audit dashboard: 4 KPI cards (Recovered, In Dispute, Active, Win Rate), surcharge breakdown bar chart, recovery pipeline area chart, top carriers, recent activity, recently recovered table, active disputes table. Data source: AirTable via `fetchRecords` scoped by `clientId`. Answers "what did we recover?" Audience: CFO, accounts payable.

2. **Compliance** — The new governance dashboard. Five governance KPIs (Uninsured Exposure, SOP Compliance, Carrier Authorization, Signature Compliance, Gateway Readiness), Coverage Gap Feed, Warehouse Scorecard, Gateway Readiness "What You Would Have Saved" summary with simulation toggle, Attestation panel. Data source: SQL report functions via `portalDataLoader()`. Answers "are we exposed right now?" Audience: risk manager, compliance officer.

No new sidebar items. "Dashboard" opens to Recovery tab by default.

### Compliance Tab Design Spec

**KPI Row** — Five stat cards, each with 30-day trend arrow:

| KPI | Source | Format |
|-----|--------|--------|
| Uninsured Exposure | `getInsuranceExposureReport()` | Dollar amount (total declared value gap, rolling 30d) |
| SOP Compliance | `policy_backtest_results` (SOP rules) | Percentage (% of shipments where SOPs were followed) |
| Carrier Authorization | `policy_backtest_results` (carrier rules) | Percentage (% on approved-carrier-only lanes) |
| Signature Compliance | `shipment_insurance_audit_results` | Percentage (% of high-value shipments with signature) |
| Gateway Ready | `"Audit Results"` gateway metadata | Percentage (% of shipments that would pass gateway precheck) |

**Coverage Gap Feed** (primary detail, below KPI row) — Table of specific shipments with insurance/contract violations:
- Columns: Shipment ID, Date, Lane (origin → destination), Declared Value, Actual Value, Violated Clause, Uninsured Exposure ($), Warehouse, Carrier
- Filters: warehouse, carrier, violation type, date range
- Sort: most recent first, or by exposure descending
- Click-through: row opens shipment detail drawer
- Empty state: "No coverage gaps found in this period"

**Warehouse Scorecard** (secondary panel, below feed) — Per-fulfillment-center compliance matrix:
- Columns: one per warehouse (e.g., Warehouse A, Warehouse B, Warehouse C)
- Rows: Packaging compliance, Signature requirement, Declared value accuracy, Carrier selection, Insurance class match
- Cells: compliance % with color coding (green ≥95%, yellow ≥85%, red <85%) + 30d trend arrow
- "Worst Offender" row at the top — the warehouse with the lowest aggregate compliance
- Empty state: "No warehouse data available"
- Data source: `policy_backtest_results` filtered by SOP and carrier rules, grouped by warehouse

**Gateway Readiness Panel** — "What You Would Have Saved" summary:
- Hero number: total preventable exposure across period ($X)
- Simulation toggle: Advisory | Require Approval | Block — recalculates numbers per mode
- "Top 5 Rules to Activate" list ranked by dollar impact
- Note: simulation only; actual activation is staff-controlled
- Empty state: "No gateway-ready rules found. Run a backtest to populate."
- Data source: `getGatewayReadinessReport()`, `getTopGatewayRuleSuggestions()`

**Attestation Panel** — Governance accountability sidebar card:
- Current attested policies list with attestation dates
- "Pending Attestations" count with alert styling when > 0
- Attest workflow: review extracted rules → sign off → timestamp recorded
- Empty state: "No policies attested. Upload your insurance policy documents to begin."
- Data source: `client_policies`, `policy_attestations`

### Multi-Type Upload Page

The Upload page (`/portal/upload`) expands from CSV-only to five document types:

| Type | Pipeline | Status Example |
|------|----------|----------------|
| Insurance Policy | AI extraction → attestation queue | "Extracting rules from Zurich Policy.pdf… 3 rules found, 2 confirmed, 1 needs review" |
| Carrier Contract | AI extraction → attestation queue | Same pipeline as insurance policy |
| SOP | AI extraction → attestation queue | Same pipeline |
| Claims History | Dispute evidence | "Uploaded claims-2026.pdf. 12 claims indexed." |
| Shipment CSV | Ingestion pipeline | "CSV processed. 847 shipments staged." |

Upload history shows: filename, type, upload date, processing status, result summary. Processing status badges: `processing`, `extracted`, `needs_review`, `complete`, `error`.

## Portal Components

| Component | File |
|-----------|------|
| Portal shell | `components/portal/portal-shell.tsx` |
| Sidebar navigation | `components/portal/sidebar.tsx` |
| Client dashboard | `components/portal/dashboard.tsx` |
| Disputes list/detail | `components/portal/disputes-list.tsx` |
| Invoices list/detail | `components/portal/invoices-list.tsx` |
| Monthly reports | `components/portal/reports-list.tsx` |
| Upload form | `components/portal/upload-form.tsx` |
| Settings/help placeholder | `components/portal/placeholder.tsx` |

## UX State Coverage

Every table/list surface needs:

| State | Pattern |
|-------|---------|
| Empty | Icon/illustration + heading + guidance copy |
| Error | Red alert + error message + staff-useful hint |
| Showing count | Mono footer with displayed/total rows |
| Filter empty | Inline "No items match this filter" row |

Guidelines:

1. Always add a row-count footer.
2. Empty states should tell the user what to do next.
3. Staff errors may show raw errors. Portal errors should be safer and less technical.
4. Filter-empty is different from data-empty.

## Assets

- `public/logo-mark.svg`
- `public/logo-wordmark.svg`
