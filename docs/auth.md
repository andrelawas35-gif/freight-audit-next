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

| Path | Access |
|------|--------|
| `/login`, `/signup` | Public; redirect if already logged in |
| `/portal/*` | Any authenticated user |
| `/*` console routes | `staff` role only |
| `/api/ingest/*` | `x-ingest-secret` header |
| `/api/run-audit` | Staff session or `x-ingest-secret` |
| `/api/run-audit/process` | `x-ingest-secret` or `CRON_SECRET` bearer |
| `/api/cron/*` | `CRON_SECRET` bearer |

## Session Shape

JWT strategy. Token/session carries:

- `id`
- `role`
- `clientId`

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
