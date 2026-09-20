# Aurelian Collective — Freight Audit Platform

_Project summary — last updated 2026-06-19._

A freight-bill audit platform that ingests carrier invoices and client shipment data,
runs a rule engine to find overcharges, manages the dispute lifecycle, and gives clients
a self-serve portal to upload data and track recoveries.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript |
| Database | Neon Serverless Postgres (project `freight-audit-next`, Postgres 18) |
| Auth | Auth.js v5 (next-auth beta) — email + password, JWT sessions |
| Charts | Recharts |
| Hosting | Vercel — **live: https://freight-audit-next.vercel.app** |

> Install note: Next is on a canary, so `npm install` requires `--legacy-peer-deps`
> (codified in `.npmrc`). Auth needs `AUTH_SECRET` + `trustHost: true`.

---

## App structure (route groups)

```
app/
  (console)/      Staff console — sidebar shell, staff-only
    page.tsx        Today / dashboard
    queue/          Audit findings queue
    disputes/       Dispute pipeline
    carriers/       Carrier scorecards
    clients/        Client portfolio
    engine/         Audit engine run control + history
    ingestion/      Ingestion & match monitor
    users/          Users & access (staff/client management)
  (auth)/         Login + signup (no chrome)
  (portal)/portal Client portal — own shell
    page.tsx        Interactive dashboard (charts, KPIs, export)
    upload/         CSV upload + history + template
  api/
    auth/[...nextauth]   Auth.js endpoints
    run-audit            Trigger the engine
    ingest/{edi,carrier,wms,sftp-poll}   Data ingestion
```

Access is gated by `middleware.ts` + `auth.config.ts`: portal = any signed-in user,
console = staff only, clients are redirected from console to portal.

---

## Major subsystems

### 1. Data layer — Neon Postgres (`lib/airtable.ts`)
Migrated off Airtable. The file keeps the original API (`fetchRecords`, `createRecord`,
`updateRecord`, …) and `{ id, ...fields }` record shape, but is backed by Postgres with
display-name columns, link fields as `text[]`, a `filterByFormula`→SQL translator, and a
numeric type-parser so amounts come back as JS numbers.

### 2. Ingestion pipeline (`lib/ingestion/`)
Normalizes every source into one universal schema (`schema.ts`) before auditing.
- **Carrier (billed):** EDI 210 parser (`edi/parser.ts`), adapters for FedEx API, UPS API,
  LTL CSV, and generic EDI. Code/service translation via `accessorial-map.ts` +
  `service-level-map.ts`.
- **Client (expected):** ShipStation + Shopify webhook adapters, generic client CSV parser
  (`client/generic-csv.ts`) with a data-health score.
- `normalize.ts` stages everything into the `Invoices` / `Shipments` tables; `uploads.ts`
  records the upload audit trail.
- API routes secured by `INGEST_SECRET` header.

### 3. Audit engine (`lib/audit/`)
- Rules: dim-weight overcharge, phantom (residential) accessorial, duplicate tracking,
  SLA / LTL-SLA late delivery.
- `engine.ts` orchestrates: fetch invoices+shipments, match, run rules, write `Audit Results`,
  log the run. Idempotent (skips already-audited invoices).
- **Layered rulebook** (`rulebook.ts`): thresholds resolve **contract → carrier → global**,
  effective-dated. Rules read keys (`dim_divisor`, `residential_surcharge`,
  `residential_waived`, `sla_transit_days`, `guarantee_enabled`) instead of constants, so
  every audit is catered to the client's negotiated contract.

### 4. Auth & access (`auth.ts`, `lib/users.ts`)
Email + password (bcrypt), JWT sessions carrying `role` + `clientId`. Signup auto-creates a
linked Client. Staff **Users & Access** screen: invite clients (temp password), promote/demote
staff, link users to companies — with a self-lockout guard.

### 5. Client portal
- **Dashboard:** interactive KPI cards, **Margin Recovery %**, recovery-over-time area chart
  (cumulative/monthly toggle), carrier/error breakdown bar chart, one-click CSV export,
  friendly status tags (New / Filed / Carrier Pushback / Pending Credit), fully responsive.
- **Upload:** flexible CSV upload, downloadable template, upload-history log, data-health score.

### 6. Internal console
Existing scorecard/queue/dispute screens, plus new **Engine** (run control + history,
`audit_runs` table) and **Ingestion** (match-rate / coverage monitor) screens.

---

## Database tables (Neon, `public` schema)

`Carriers`, `Carrier Codes`, `Clients`, `Shipments`, `Invoices`, `Audit Results`, `Disputes`
(core) · `app_users` (portal/staff accounts) · `audit_runs` (engine history) ·
`upload_logs` (upload trail) · `rulebook` (3-tier thresholds).
(`neon_auth` schema exists from Neon Auth provisioning but is unused — auth is Auth.js.)

---

## Deployment
- Live on Vercel at **https://freight-audit-next.vercel.app**, production target, same Neon DB
  as local. Env vars set: `DATABASE_URL*`, `AUTH_SECRET`. `.npmrc` forces legacy-peer-deps.
- Deployed via Vercel CLI (`vercel deploy --prod`). Git auto-deploy not yet connected.

### Test accounts (seeded demo data — purge before launch)
- Staff: `staff@aurelian.test` / `staffpass123`
- Client: `demo@aurelian.test` / `demopass123` (company "Demo Freight Co" with sample
  disputes, invoices, findings).

---

## Suggested next steps
1. **Auto-run audit on upload** — call `runAudit({clientId})` after staging so findings appear
   in the queue without a manual trigger.
2. **Rulebook phase 2 UI** — staff screen to edit global/carrier/contract rows.
3. **Carrier invoice ingestion → re-audit** so the billed side stays current.
4. **Purge demo data** + set real staff credentials.
5. Connect **GitHub auto-deploy**; later a marketing site and carrier OAuth onboarding.
