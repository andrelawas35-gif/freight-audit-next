# Policy Intelligence — The Aurelian Gateway (operationalize step)

> **STATUS: IMPLEMENTED (2026-06-26).** The Gateway V1 Fastify service is built at
> `services/gateway/` — 6 source files implementing D1-D6. Shadow-first (`enforced: false`
> always in V1), per-client API keys, versioned snapshot cache, risk-tiered fail handling,
> at-least-once durable decision log. Backtest engine (E2) is correct; attestation UI (E4)
> closes the governance liability loop. **LOCKED** = settled; **OPEN** = being resolved.
> Implementation details in `../CHANGELOG.md`; remaining open work in `../BACKLOG.md`.

## What this is

The Gateway is the **operationalize** step of the Policy Intelligence pipeline
(`README.md`): the runtime service that evaluates a pre-shipment request against a
client's active ruleset and returns ALLOW / WARN / BLOCK / REQUIRE_APPROVAL /
REQUIRE_DOCUMENTATION **before** a label is purchased. It sits between a brand's
WMS/e-commerce platform and their carrier APIs.

## The reframe (what already exists vs. what the proposal asks for)

The pasted "Senior Systems Architect" brief asks to build things that are already built,
and proposes a few patterns that fight this codebase:

1. **The core loop already exists.** `lib/intelligence/policy-evaluator.ts`
   `evaluatePolicyContext()` is a **pure, synchronous, deterministic** function
   (context + rules → `PolicyDecision[]`, default-allow). It is already <100ms-ready (no
   I/O). The Gateway is a **transport + cache + logging + auth shell** around it, **not** a
   new evaluation engine. Do not reimplement the rule check.
2. **Decisions are 5-valued, not binary.** `GATEWAY_ACTIONS` =
   `ALLOW|WARN|BLOCK|REQUIRE_APPROVAL|REQUIRE_DOCUMENTATION`. A bare `403` can only express
   BLOCK and deletes the other behaviors and the graduated-rollout story (OPEN-Q3).
3. **V1 should not hard-block.** `05-readiness.md` already defines rollout modes
   **advisory → require approval → block**. Launch in **shadow/advisory** mode; earn BLOCK
   (OPEN-Q2).
4. **Stack reconciliation.** Platform is Next.js on Vercel serverless; the brief wants
   Fastify + in-memory cache + <100ms. Serverless + in-memory cache is self-contradictory
   (per-instance memory, cold starts). Reuse `lib/api-handler.ts` (`withObservability`),
   `lib/logger.ts`, correlation IDs, `/api/health` — do not reinvent (OPEN-Q4/Q6).
5. **"Fire-and-forget" logging contradicts "forensic insurance evidence."** The durable
   decision log *is* the product; it must be at-least-once off the response path, not
   best-effort (OPEN-Q6).

## Decisions

### D1 — Interception model: **pre-flight precheck + signed approval token; canonical adapter boundary** — LOCKED
- **V1 is a pre-flight check the WMS calls** (`POST /v1/precheck`) *before* it requests a
  label — **not** a carrier-API proxy. Smallest surface: one endpoint, one Zod schema, zero
  carrier dialects; a Gateway outage degrades to "ship anyway" rather than halting
  fulfillment (see D5). The evaluator's `ShipmentPolicyContext` **is** the precheck schema.
- **Enforcement hook = a short-lived signed `approval_token`.** On ALLOW, return a signed
  token; the label-purchase step (a platform hook, or our own later) requires it. Gives
  incremental "physical" enforceability where we control the label step, without becoming a
  full carrier proxy day one.
- **Stop overclaiming.** In this model the Gateway *governs* the label (the integration
  honors the verdict); it does not "physically prevent" it. Only a true proxy earns that
  phrase — same honesty discipline as `../data-protection.md` ("cryptographic separation").
- **"Ready for any WMS" = canonical contract + per-WMS adapter.** The engine is
  WMS-agnostic. Onboarding a new WMS = one thin adapter mapping its label-request payload →
  `ShipmentPolicyContext` (mirrors the ingestion adapter pattern in `../ingestion.md`). A
  generic JSON contract is the zero-adapter fallback. Claim: *"any WMS that can call a
  webhook before buying a label can integrate"* — not "works with every WMS automatically".

**Deferred:** (a) true carrier-API proxy (man-in-the-middle) — only when a design partner
demands inline proxying *and* rule quality is proven in shadow mode; until then it trades
compliance-logic work for carrier-API quirks and warehouse-halting outage risk. (c) a
platform-native pre-purchase hook (ShipStation/Shopify/EasyPost) is additive and gives real
enforcement for brands on that platform — do it per design-partner.

### D2 — V1 rollout mode: **shadow by default; per-rule, evidence-gated graduation** — LOCKED
- **V1 ships shadow/advisory.** Precheck always returns ALLOW + token, but evaluates and
  **logs the verdict it would have made**. Client sees "the Gateway would have blocked N
  labels" — the `05-readiness.md` "Operational Fix" deliverable. Zero fulfillment risk,
  immediate value, and it accumulates the evidence that earns enforcement.
- **Mode is per-client AND per-rule, stored as data.** A client may enforce a proven rule
  (`adult_signature_required`) while shadowing a newly discovered one. A global block
  boolean is too blunt — one bad rule must not take down the good ones.
- **Graduation shadow → require_approval → block** is gated on N reviewed shadow firings
  with an acceptable false-positive rate (analyst-reviewed; reuses the "analyst confirmation
  over automation for the first 3–5 clients" principle, `05-readiness.md`).
- **`REQUIRE_APPROVAL` is the pressure-relief valve** between shadow and block: human
  sign-off instead of a halted truck. Far more sellable to a nervous 3PL than BLOCK.
- **Where enforcement lives:** the evaluator (`mode:'pre_shipment'`) always returns the
  *true* verdict; the **gateway shell** decides whether to act on it per the per-rule mode.
  Evaluator stays pure; enforcement is a shell concern.
- **Exception:** a hand-picked, unambiguous rule may be enforced day one on top of an
  otherwise-shadow deployment where a design partner insists (e.g. jewelry >$5k w/o
  signature).

### D3 — Decision contract: **always HTTP 200, verdict in body, severity-aggregated** — LOCKED
- **HTTP status = transport only.** 200 = evaluated; 400 = bad payload; 401/403 = bad API
  credentials; 5xx = Gateway failure. A compliance **BLOCK is a successful evaluation →
  `200` with `{decision:"BLOCK"}`**. Never overload 403 to mean "policy violation" — it
  collides with 403 = "bad key" and poisons the audit trail.
- **Aggregate `PolicyDecision[]` by severity precedence:**
  `BLOCK > REQUIRE_APPROVAL > REQUIRE_DOCUMENTATION > WARN > ALLOW`. Return the effective
  decision **and** the full list (every reason, for forensics).
- **Response shape (stable, WMS-agnostic — D1 canonical contract):**
  `decision` (effective), `enforced` (bool, from D2 per-rule mode), `approval_token`
  (signed, when effective-allow), `violations` (full `PolicyDecision[]`), `correlationId`
  (reuse observability), `rulesetVersion` (lineage / reproducibility).
- **`enforced:false` is shadow mode:** return the real `BLOCK` + a token; the WMS logs the
  would-block and proceeds. Shadow vs enforce is a data property of the response.
- **Always include `rulesetVersion`** — the forensic/insurance story needs reproducibility
  (which ruleset produced the verdict; ties to effective-dating in D4, lineage in
  `04-backtest.md`).
- **Compatibility shim:** for a status-code-only legacy integration, map effective BLOCK →
  `403` for that client only; keep the canonical body-based contract everywhere else.

### D4 — Topology: **separate always-on Fastify service; versioned snapshot cache** — LOCKED
The proposal's stack is self-contradictory: Vercel/Lambda serverless + in-memory cache +
<100ms cannot all hold (cold starts blow the budget; per-instance memory can't be a
coherent, invalidatable cache).

- **Separate service, not the Next app.** Console/portal stays serverless Next; the Gateway
  is a long-running, latency-critical, independently-scaled hot path. The evaluator is a
  **pure importable function** — same `lib/intelligence/` code in both; only the transport
  shell differs. Package the evaluator so both consume it.
- **Host: Fly.io / Railway always-on container** (min 1 instance, no scale-to-zero). This is
  what makes in-memory cache + <100ms real (warm process answers in single-digit ms). Also
  the right home for the `../data-protection.md` D2 **pooled** pg connection (serverless is
  not).
- **Cache = versioned ruleset snapshot.** On boot, load each active client ruleset into
  memory: `clientId → {rulesetVersion, rules[]}`. Per request: zero DB reads, pure evaluator.
- **Invalidation = TTL + version-stamp** (~60s bound) to start; upgrade to Postgres
  `LISTEN/NOTIFY` only if a client needs seconds-level propagation (e.g. emergency embargo).
  Every decision logs `rulesetVersion`, so staleness is bounded and visible, never silent.
- **Effective-dating preserved:** snapshot selects the ruleset effective for the shipment's
  date (same as `04-backtest.md`); the cache must not flatten to "latest active".
- **Observability reuse:** import `lib/logger.ts` + correlation-ID propagation (framework-
  agnostic) into a small Fastify plugin; port `withObservability` *behavior* (correlation
  header in/out, structured request log, Sentry scope) — the Next wrapper itself is
  Next-specific.

### D5 — Failure mode: **fail-open default; risk-tiered fail-closed (jewelry-aware)** — LOCKED
The proposal never addresses this; it is the first question a 3PL ops manager asks. A
blanket choice is wrong — tie failure behavior to the **shipment's risk**, not the
Gateway's health.

- **Default fail-open.** On timeout (client-side budget ~150–200ms; our target <100ms gives
  headroom) or error, the WMS proceeds. Halting a warehouse over a middleware hiccup gets us
  ripped out faster than any missed check, and in shadow mode (D2) we aren't blocking anyway.
- **Every fail-open is logged as a gap:** `decision:"ALLOW", reason:"gateway_unavailable",
  degraded:true`. The forensic/insurance trail (D6) must be able to say "these shipped
  *un-evaluated*". A silent fail-open destroys the audit trail's integrity.
- **Timeout lives on the WMS/adapter side** so fulfillment continues even if our service is
  fully down.
- **Risk-tiered fail-closed (the jewelry design).** Failure behavior is routed by
  `declaredValue` (present in the payload even when rule eval fails): below a per-client
  threshold → fail-open; **above it → fail-closed / hold-for-review.** Missing/unparseable
  declared value on a high-value vertical → treat as high-risk → **fail-closed**
  (`DATA_REQUIRED`); "unknown-value jewelry" is the dangerous case.
- **Jewelry rationale:** extreme per-shipment risk (one uninsured $5k label = denied claim)
  + low volume (a hold is an inconvenience, not a catastrophe) → fail-closed is defensible
  *early* for the high-value subset. **Recommended-on for jewelry**, scoped to the
  above-threshold subset — never a blanket warehouse halt, never the global default.
- Honest client line: "we fail open and tell you exactly which shipments shipped
  un-evaluated; above $X we hold for review instead." Truthful, not "unbreakable gate".

### D6 — Forensic logging + auth: **at-least-once decision log; per-client API keys** — LOCKED
The decision log **is the insurance product** (evidence the Gateway warned/blocked, backing
a claim dispute). "Fire-and-forget" gambles the audit trail for latency — unacceptable.

- **Respond first, persist durably second — but guarantee the persist.** Response returns
  right after evaluation (keeps <100ms); the decision is handed to a **local durable buffer
  (at-least-once)** that drains to Postgres. A crash replays, never loses. This is the one
  real change from the proposal's fire-and-forget.
- **Two streams, different durability.** Operational telemetry (latency/errors) reuses
  `lib/logger.ts` → stdout/Sentry, best-effort. The **compliance decision record** (verdict,
  `rulesetVersion`, `degraded`, full `violations[]`) is financial-grade → `gateway_decisions`
  table.
- **`gateway_decisions` is Tier-2 tenant data** → under `../data-protection.md` RLS, written
  by the restricted role. The forensic log inherits the isolation design.
- **Per-client API keys, not the shared `INGEST_SECRET`.** `../auth.md` already flags
  replacing the single shared secret. The authenticated **key is the tenant identity**:
  `clientId` for evaluation and for RLS `app.current_tenant` comes from the key, **never**
  from the request body (a 3PL must not spoof another brand's `clientId` — mirrors
  `../auth.md` "never accept arbitrary client IDs from forms").
- **Key → clientId resolution is cached** in the warm snapshot (D4) — auth adds no
  per-request DB hit.

## Phase-1 implementation checklist (when planning ends)

Depends on: the policy evaluator (exists) and `../data-protection.md` D2 restricted role
(for the Tier-2 decision log). Does **not** depend on the AI extractor.

1. New service package (Fastify, strict TS) importing `lib/intelligence` evaluator; deploy
   always-on on Fly/Railway (min 1 instance).
2. `POST /v1/precheck`: Zod schema = `ShipmentPolicyContext`; per-WMS adapter boundary +
   generic JSON fallback (D1).
3. Warm versioned snapshot cache: `clientId → {rulesetVersion, rules[]}`; effective-dated
   selection; TTL+version-stamp invalidation (D4).
4. Response contract: always-200, severity-aggregated effective decision, `enforced`,
   `approval_token` (signed), `violations[]`, `rulesetVersion`, `correlationId` (D3).
5. Per-client mode resolution (shadow / require_approval / block), per-rule (D2).
6. Risk-tiered failure: client-side timeout; fail-open default; fail-closed above a
   per-client `declaredValue` threshold + on missing value for high-value verticals (D5).
7. `gateway_decisions` table (Tier-2, RLS) + at-least-once durable buffer → drain (D6).
8. Per-client API keys; key→clientId is the only tenant-identity source (D6).
9. Port observability behavior into a Fastify plugin (correlation IDs, structured logs,
   Sentry, `/health`).
10. Signed `approval_token` issuance + verification contract for the label step.

## Related docs

- `../policy-intelligence/README.md` — the pipeline this is the last step of.
- `04-backtest.md` — same evaluator, `mode:'backtest'`; the Gateway is `mode:'pre_shipment'`.
- `05-readiness.md` — rollout modes (advisory/approval/block) and the client-facing "cure".
- `../data-protection.md` — the Gateway reads Tier-2 `policy_rules` (RLS + restricted role).
- `../observability.md` — logging/correlation/health infra to reuse.
