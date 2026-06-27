# ADR 0004 — Gateway is an evaluator mode, not a separate service

- Status: Accepted — reaffirmed and extended by [ADR 0016](0016-gateway-launches-in-process.md) (2026-06-27), which resolves the contradiction with 08-gateway.md D4 and records the in-process auth/log/cache implementation decisions.
- Date: 2026-06-26
- Deciders: Freight-audit domain-modeling grilling session
- Replaces: E3 "New Fastify precheck service" from the fleet build plan
- Related: [ADR 0002](0002-extraction-service-language-boundary.md) (no Python worker without concrete trigger),
  [ADR 0003](0003-retrieval-and-llm-boundary.md) D2 (one evaluator feeds both gateway and auditor)

## Context

The fleet build plan assigned E3 to build a "new Fastify precheck service, shadow-first" — a
separate Node.js runtime with its own deploy target, `/v1/precheck` endpoint, snapshot cache,
always-200 contract, and per-client API keys. This implied two evaluator runtimes (Next.js +
Fastify) reading the same Postgres rules, with two tenant-isolation implementations and two
failure domains.

ADR 0003 D2 had already established that `evaluatePolicyContext()` runs in both
`mode: 'backtest'` and `mode: 'pre_shipment'` — one function over one Postgres source.
ADR 0002 had rejected a separate Python extraction worker because a second
language/deploy/failure domain was premature at current scale.

## Decision

The Gateway is a **mode of the existing TypeScript evaluator**, deployed as an API route in
the Next.js app — not a separate Fastify service.

- `/v1/precheck` lives as a Next.js API route under the existing ingest-secret auth (or
  per-client API keys when those are built).
- The snapshot cache ("always-200" contract) is a read-replica + materialized-response
  concern, not a separate-service concern. It can be built inside the Next.js route with a
  TTL cache layer.
- `gateway_decisions` logging happens in the same Postgres transaction as the evaluation.
- Risk-tiered fail-closed behavior is a config on the evaluator, not a separate service's
  failure mode.

The Fastify precheck service is **not adopted**. The build plan's E3 Gateway track is
rescoped to: `/v1/precheck` API route, snapshot cache layer, per-client API keys, and
`gateway_decisions` logging — all in-process in the Next.js app.

## Consequences

- One evaluator, one language, one deploy target, one tenant-isolation model. Matches the
  ADR 0002 reasoning pattern.
- The always-200 + snapshot cache contract is still achievable in-process.
- If precheck latency or throughput demands a separate runtime later, the evaluator
  function is pure enough to extract — but that is the trigger for a future ADR, not a
  pre-build assumption.
- E3's work products (per-client API keys, gateway_decisions log, risk-tiered fail-closed)
  are preserved. Only the runtime assumption changes.

## Alternatives considered

- **Separate Fastify service.** Offers process isolation and independent scaling, but at
  current scale (3-5 onboarding clients, pre-shipment volume zero until gateway readiness
  assessments convert) adds a second deploy target, second connection pool, second
  tenant-isolation implementation, and second failure domain. Premature — same reasoning
  as ADR 0002's rejection of a Python worker.
