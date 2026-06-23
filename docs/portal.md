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
| Dashboard | `/portal` | Client + Disputes + Invoices + Audit Results |
| Disputes | `/portal/disputes` | Disputes + Audit Results |
| Invoices | `/portal/invoices` | Invoices + Audit Results |
| Upload | `/portal/upload` | Upload form + upload_logs |
| Reports | `/portal/reports` | Disputes + Invoices aggregated by month |
| Settings | `/portal/settings` | Placeholder |
| Help | `/portal/help` | Placeholder |

Future client-facing gateway readiness reports should be framed as "savings opportunity" and "pre-shipment controls," not internal taxonomy labels.

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
