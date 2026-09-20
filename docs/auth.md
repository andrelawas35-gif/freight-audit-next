# Authentication and Authorization

## Framework

Auth.js v5 beta (`next-auth@5.0.0-beta.31`).

## Files

| File | Purpose |
|------|---------|
| `auth.config.ts` | Edge-safe config used by middleware |
| `auth.ts` | Credentials provider with bcrypt password verification |
| `middleware.ts` | Route protection via Auth.js authorized callback |
| `lib/users.ts` | User CRUD and bcrypt hashing |
| `app/(auth)/actions.ts` | Login/signup server actions |
| `app/(auth)/layout.tsx` | Auth layout |

## Route Protection

The `authorized` callback in `auth.config.ts` gates all routes. Public
routes are allow-listed **before** the `!isLoggedIn` check so that
webhooks, crons, health probes, and the marketing site are accessible
without authentication. Each API route has its own secondary auth guard
(headers, secrets, or session checks).

| Path | Middleware Auth | Role Gate | Secondary Auth |
|------|----------------|-----------|----------------|
| `/api/auth/*` | No | — | Auth.js internal |
| `/login`, `/signup` | No (public) | Redirect if logged in | — |
| `/api/ingest/*` | No | — | `x-ingest-secret` |
| `/api/cron/*` | No | — | `CRON_SECRET` bearer |
| `/api/run-audit` | No | — | Staff session or `x-ingest-secret` |
| `/api/run-audit/process` | No | — | `x-ingest-secret` or `CRON_SECRET` bearer |
| `/api/run-audit/status` | No | — | Staff session or `x-ingest-secret` |
| `/api/v1/precheck` | No | — | Per-client `x-api-key` (`GATEWAY_API_KEY_<clientId>` env vars), single `GATEWAY_API_KEY` (backward compat), or staff session |
| `/api/health` | No | — | None (liveness probe) |
| `/*` (marketing) | No | — | — |
| `/portal/*` | Yes | Any authenticated | — |
| `/console/*` | Yes | `staff` | — |

## Session Shape

JWT strategy. Token/session carries:

- `id`
- `role`
- `clientId`

> `session.user.clientId` is the app-layer source of tenant identity. The planned
> database-layer failsafe (Row-Level Security keyed on `app.current_tenant`) is designed
> in [`data-protection.md`](data-protection.md): the value injected into the restricted
> pooled connection originates here.

## Roles

- `staff` - console access for audit ops, ingestion, disputes, engine, rulebook, users.
- `client` - portal access only, scoped to one client.

## Server Action Requirements

- Staff console actions must check `session.user.role === 'staff'`.
- Portal actions must use `session.user.clientId`; never accept arbitrary client IDs from portal forms.
- Ingestion control panel actions are staff-only.
- Queue, disputes, rulebook, user admin, and manual ingestion actions must validate form inputs with Zod or equivalent guard logic.

## Ingestion Security

- API ingestion routes use `x-ingest-secret`.
- Console manual ingestion uses staff session auth and server actions; it does not require exposing `INGEST_SECRET` to the browser.
- SFTP credentials must remain in environment variables. The UI may enqueue `sftp_fetch`, but must not display or accept private keys.
- Future per-carrier API keys should replace the single shared `INGEST_SECRET`.

## Gateway API Key Authentication (ADR 0016 D1)

The Gateway precheck endpoint (`POST /api/v1/precheck`) authenticates callers via per-client API keys. Three auth strategies are supported, resolved in priority order:

### Strategy 1: Per-client API key (preferred)

Set one environment variable per client:
```
GATEWAY_API_KEY_<clientId>=<random-secure-key>
```

Example:
```
GATEWAY_API_KEY_acme_corp=sk_live_abc123...
GATEWAY_API_KEY_widgets_inc=sk_live_def456...
```

Callers include the key in the `x-api-key` header:
```
POST /api/v1/precheck
x-api-key: sk_live_abc123...

{ "trackingNumber": "1Z9999W99999999999", "carrierScac": "UPSN" }
```

**`clientId` is derived from the key** — the env var name (`GATEWAY_API_KEY_acme_corp`) yields `acme_corp`. If the request body also includes `clientId`, it MUST match the derived value or the request is rejected (HTTP 403). This closes the tenant-spoofing hole from the legacy single-key model.

The derived `clientId` becomes the tenant for the RLS-protected `gateway_decisions` write via `getTenantSql(clientId)`.

### Strategy 2: Single `GATEWAY_API_KEY` (backward compat)

For deployments that have not yet migrated to per-client keys, a single shared key is supported:
```
GATEWAY_API_KEY=<shared-key>
```

Callers use the `x-api-key` or legacy `x-gateway-api-key` header and MUST include `clientId` in the request body:
```
POST /api/v1/precheck
x-api-key: <shared-key>

{ "clientId": "acme_corp", "trackingNumber": "...", "carrierScac": "UPSN" }
```

### Strategy 3: Staff session

Staff users authenticated via the console can call the precheck endpoint with their session cookie. The `clientId` must be provided in the request body.

### Header Migration

| Old Header | New Header | Status |
|------------|-----------|--------|
| `x-gateway-api-key` | `x-api-key` | Deprecated; still accepted for backward compat |

## Gateway, Policy, and Insurance Security

> Security controls for the Policy Intelligence concern (modeled in
> [`policy-intelligence/`](policy-intelligence/README.md); the AI suggest-only trust
> boundary is detailed in
> [`policy-intelligence/02-extraction.md`](policy-intelligence/02-extraction.md#trust-boundary)).

Policy intelligence data may include sensitive coverage limits, broker details, exclusions, risk controls, carrier contract terms, 3PL pricing, operational SOPs, and client exception approvals. Treat it as client-confidential:

- staff console only by default;
- portal exposure only after explicit product decision;
- never include private policy details in public logs;
- redact policy documents or use controlled file storage when added;
- keep AI extraction suggest-only until a human confirms structured policy rules.

MVP policy controls:

- `/policies/*` and `/gateway-readiness/*` are staff-only until client-safe reporting exists.
- Policy documents should not be served directly from public paths.
- Extracted text and clause summaries should be scoped by `client_id`.
- AI prompts for policy extraction must avoid sending unrelated client records.
- Backtest results may be client-facing only after staff review and wording cleanup.
- Future gateway validation APIs must authenticate the client/source system and return only the decision needed at label creation time, not the full policy rulebook.

## Important Notes

- Install with `--legacy-peer-deps` due to next-auth beta peer conflicts.
- `trustHost: true` is required in auth config for non-Vercel deployments.
- Middleware uses the edge-safe auth config; do not add DB/bcrypt work there.
