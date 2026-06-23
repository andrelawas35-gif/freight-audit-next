# Launch Blockers

Only open items that block production launch belong here. Completed/historical items belong in `docs/CHANGELOG.md`. Product roadmap work belongs in `docs/BACKLOG.md`.

## Server Action Input Validation

Zod validation exists on API routes. Server actions still need production-grade validation.

- [ ] `app/(console)/disputes/actions.ts`
  - Acceptance: all externally supplied form fields are parsed through Zod or equivalent explicit validators; invalid input returns a safe error.
- [ ] `app/(console)/queue/actions.ts`
  - Acceptance: review status, audit result IDs, and bulk IDs are validated before DB writes.
- [ ] `app/(console)/rulebook/actions.ts`
  - Acceptance: scope, rule key, client/carrier IDs, effective dates, and numeric/bool/text values are validated before DB writes.

## Error Monitoring and Logging

- [ ] Add/verify Sentry production configuration.
  - Acceptance: server, edge, and client errors report in production with source maps.
- [ ] Add structured logging with request correlation IDs.
  - Acceptance: ingest, audit job, queue, dispute, and auth paths emit correlated logs.
- [ ] Add `/api/health`.
  - Acceptance: returns DB connectivity and build/runtime health without leaking secrets.

## Test Coverage

- [ ] Unit tests for all audit rules in `lib/audit/rules/*.ts`.
  - Acceptance: null/missing-data guard, no-flag path, flagged path, rulebook override.
- [ ] Unit tests for 3PL rules in `lib/audit/3pl-rules.ts`.
  - Acceptance: pick, packaging, markup, ghost, duplicate, storage, data-required paths.
- [ ] Unit tests for rulebook resolver in `lib/audit/rulebook.ts`.
  - Acceptance: contract/carrier/global precedence, service bonus, effective dates.
- [ ] Integration tests for ingestion normalization.
  - Acceptance: FedEx, UPS, EDI, LTL CSV, ShipStation, Shopify, generic CSV.
- [ ] API route tests.
  - Acceptance: auth checks, validation errors, happy path, failure path.

## UI Table Count Coverage

- [ ] Add total-count queries and "showing X of Y" messaging to bounded UI tables.
  - Acceptance: bounded staff/portal tables disclose truncation and avoid implying completeness.
