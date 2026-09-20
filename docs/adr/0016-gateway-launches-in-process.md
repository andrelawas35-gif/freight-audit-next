# ADR 0016 — Gateway Launches In-Process; Fastify Service Shelved

- **Status**: ACCEPTED
- **Date**: 2026-06-27
- **Deciders**: Controller (grilling session — tech-stack launch-readiness review)
- **Supersedes**: [`policy-intelligence/08-gateway.md`](../policy-intelligence/08-gateway.md) **D4** (separate always-on Fastify service)
- **Reaffirms / extends**: [ADR 0004](0004-gateway-is-a-mode-not-a-service.md) (gateway is an evaluator mode, a Next.js route)
- **Related**: ADR 0013 (RLS client path), 08-gateway.md D3/D5/D6

## Context

Two same-day (2026-06-26) accepted decisions contradict each other, and **both were partially built**:

- ADR 0004 decided the Gateway is an **in-process Next.js route** — a second runtime is premature at 3–5 onboarding clients with zero pre-shipment volume. `app/api/v1/precheck/route.ts` exists.
- 08-gateway.md **D4** decided a **separate always-on Fastify service** on Fly/Railway, because serverless + in-memory warm cache + <100ms "cannot all hold." `services/gateway/` (6 files) exists and is marked IMPLEMENTED/LOCKED.

The result is the SO1 overlap: two precheck implementations, two auth models (single `GATEWAY_API_KEY` + body `clientId` vs per-client `GATEWAY_API_KEY_<clientId>`), two failure domains. The tech-stack review also found the Fastify service has no deploy target, an ephemeral-FS decision-log buffer, and a replay-wedge bug.

The crux: D4's whole justification is the **<100ms warm-cache hot path**, which only matters at **real throughput** — and both docs agree throughput is **zero at launch**. So D4 optimizes for traffic that does not exist yet, at the cost of a second runtime, pool, tenant-isolation model, and failure domain *now*.

## Decision

The launch Gateway is the **in-process Next.js route** (`/api/v1/precheck`), per ADR 0004. 08-gateway.md D4 is superseded. `services/gateway/` is **shelved as the reference implementation** for a future extraction, not deleted.

**Extraction trigger (future ADR):** real pre-shipment volume, or a design partner requiring enforced (<100ms, non-shadow) prechecks. ADR 0004 already named this trigger; the evaluator is a pure importable function, so extraction stays cheap. The shelved Fastify code is the head start.

Three implementation decisions for the in-process route:

1. **Auth — port per-client keys (08-gateway D6).** Replace the single global `GATEWAY_API_KEY` + body `clientId` with `GATEWAY_API_KEY_<clientId> → clientId` resolution. `clientId` comes from the key, never the body (reject a body `clientId` that disagrees). The resolved tenant sets `app.current_tenant` for the RLS-protected `gateway_decisions` write (ADR 0013). Closes the current tenant-spoofing hole.

2. **Decision log — synchronous, in transaction.** Write `gateway_decisions` synchronously before responding, as `app_tenant`. No file buffer — which removes the ephemeral-FS problem and the replay-wedge bug, and makes the forensic log durable by construction. At-least-once via a durable buffer returns with the Fastify extraction, when "respond-first, persist-second" latency matters.

3. **Cache — per-request effective-dated read.** No warm in-memory cache (meaningless per-instance on serverless). Read the effective-dated ruleset per request at launch volume; add a module-level TTL cache only when volume justifies. (This also sidesteps the lexicographic version-selection bug in the shelved cache.)

## Consequences

- One gateway, one runtime, one auth model, one failure domain for launch — matching ADR 0004's and ADR 0002's "no second deploy/failure domain before the trigger" pattern.
- The current `/api/v1/precheck` tenant-spoofing hole (body `clientId`) is closed.
- The shelved service's three known defects (no deploy target, ephemeral buffer, wedge bug) stop being launch concerns — they ride along with the deferred extraction.
- D3 (always-200 contract), D5 (risk-tiered fail-closed), and D6 (per-client keys, forensic log) are preserved — only the runtime is in-process.
- `services/gateway/` stays in the tree as reference; CI/deploy must not treat it as a launch artifact.

## Alternatives considered

- **Adopt D4 (Fastify is the launch gateway).** Requires a deploy target, a non-ephemeral buffer, and retiring the Next route — paying second-runtime cost to optimize latency for zero launch traffic. Rejected until the extraction trigger.
- **Keep both (Next live, Fastify shadow).** Preserves the exact two-failure-domain / two-auth-model overlap this ADR exists to remove. Rejected.
