# ADR 0014 — Home for CLIENT_DEFINED Rules (Designated Draft + Copy-Forward)

- **Status**: ACCEPTED
- **Date**: 2026-06-26
- **Deciders**: Controller (grilling session — post-launch-blocker review)
- **Related**: ADR 0012 (4-tier extraction, T4 Define/Exclude/Flag), ADR 0009 (attestation), [`CONTEXT.md`](../../CONTEXT.md) (Ruleset), `app/(portal)/portal/policy-review/actions.ts`, `db/migrations/0005_policy_intelligence_mvp.sql`

## Context

ADR 0012 D5's T4 "Define" workflow lets a client provide an operational definition for an ambiguous clause, creating a `draft` rule with `signal_source='CLIENT_DEFINED'` that staff later review and activate. The launch-blocker review found `defineClauseAction` inserts that rule with `ruleset_id = NULL`, which violates `policy_rules.ruleset_id NOT NULL` and fails every time — so the question of *where a client-defined rule lives* was never actually answered.

Two domain constraints (from [`CONTEXT.md`](../../CONTEXT.md) "Ruleset") bound the answer:

1. The **Ruleset is the version unit**, and the **active** ruleset is the attested effective-dating authority — the sole record of what rules were in force on a date. It cannot be mutated after attestation without rewriting history and invalidating the client's sign-off.
2. Rules are only ever evaluated **through** a ruleset (evaluator and backtest join via `ruleset_id`), so a `NULL` ruleset makes a rule inert and invisible.

## Decision

A `CLIENT_DEFINED` rule attaches to a **single, designated per-client draft ruleset** — the client's "next version":

- On Define, `findOrCreateNextDraft(clientId)` returns that draft, **copying forward the current active ruleset's rules** into it on first creation.
- The `CLIENT_DEFINED` rule is inserted with `status='draft'`, `signal_source='CLIENT_DEFINED'`, `ruleset_id = draft.id`.
- The draft rides the existing `draft → client_attested → active` lifecycle. When it activates, it supersedes the prior active ruleset as the next version — additively, because the prior rules were copied forward.

This keeps the active ruleset immutable, keeps every rule inside a ruleset, and routes client definitions through the normal staff review + attestation + activation path rather than around it.

## Consequences

- **Versioning is additive (copy-forward).** A new draft version = prior active rules + the new change. Without copy-forward, activating the draft would silently drop all existing active rules (only one active ruleset per client is allowed). This semantic is now recorded in `CONTEXT.md`'s Ruleset definition.
- **`defineClauseAction` must be made transactionally honest.** The scope-exclusion `status='defined'` update and the rule INSERT must commit atomically (see the separate finding on `sql.query('BEGIN')` atomicity on the Neon HTTP driver) — a failure must not leave the exclusion `defined` with no rule.
- **Attestation loop — RESOLVED by [ADR 0015](0015-staff-review-gate-for-client-defined-rules.md):** a `CLIENT_DEFINED` rule is client-originated, yet the Ruleset attestation model has the *client* attest that rules are correct. ADR 0015 gates the client-defined rule behind a staff correctness review (`staff_reviewed` flag) before it counts toward an attestable/activatable version, so the client never self-attests their own raw definition into enforcement.
- **Designated-draft identity:** the "next version" draft is found by `(client_id, status='draft')`; if multiple drafts can coexist for a client, the find-or-create needs a deterministic marker or a reserved version label to stay unambiguous.

## Alternatives considered

- **Attach to any existing draft, else fail** — blocks client Define whenever there's no clean draft; brittle UX and pushes a setup chore onto staff at the worst moment.
- **Allow `ruleset_id = NULL` for draft client rules** — smallest schema change, but creates inert orphan rules the evaluator/backtest never see and weakens the "rules live in a Ruleset" invariant. Rejected as modeling debt.
