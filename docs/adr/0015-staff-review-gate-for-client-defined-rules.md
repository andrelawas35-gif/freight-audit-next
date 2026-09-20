# ADR 0015 — Staff Correctness Gate for Client-Defined Rules

- **Status**: ACCEPTED
- **Date**: 2026-06-26
- **Deciders**: Controller (grilling session — post-launch-blocker review)
- **Related**: ADR 0014 (resolves its open "attestation loop"), ADR 0012 D5 (T4 Define), ADR 0009 (attestation), [`CONTEXT.md`](../../CONTEXT.md) (Attestation), CLAUDE.md invariant #4 (suggest-only)

## Context

ADR 0014 routes a `CLIENT_DEFINED` rule into the client's designated draft ruleset. But that rule is **client-authored**, which breaks the assumption attestation rests on. Per [`CONTEXT.md`](../../CONTEXT.md), Attestation is *"the client reviews extracted rules… signs off… makes every future coverage gap a 'you attested, then violated' event"* — its value comes from the client confirming the **system's** interpretation of **their** document. A client attesting their own authored rule proves acknowledgment, not correctness.

The lifecycle is `draft → client_attested → active`: the client attests first, and staff "activation" is a per-ruleset transition, not a per-rule review. So without a new gate, a client could author an unsound rule (e.g. `BLOCK everything over $1`), attest the draft containing it, and have staff rubber-stamp the whole ruleset live — with no expert check on the client's own rule. ADR 0012 D5 says staff "review and activate"; this ADR makes that review a real gate.

## Decision

A `CLIENT_DEFINED` rule is created in a **not-yet-attestable** state and is excluded from the attestable and activatable set until a staff member clears it:

- On Define, the rule is created in the designated draft (per ADR 0014) but flagged unreviewed — recommended as a `staff_reviewed boolean NOT NULL DEFAULT false` column on `policy_rules`, rather than a new `status` value (the existing `CHECK (status IN ('draft','active','archived'))` and every `status IN (...)` query in the evaluator, gateway cache, and backtest would otherwise have to learn a fourth state).
- A draft ruleset **cannot transition to `client_attested`/`active` with an unreviewed `CLIENT_DEFINED` rule counted in** — unreviewed client rules are skipped on activation even if their ruleset activates.
- Staff review flips `staff_reviewed = true`, moving the rule into the set the client attests and staff activate.

So the rule the client attests is always staff-reviewed; client authorship supplies the acknowledgment gate, staff review supplies the correctness gate. This keeps the spirit of CLAUDE.md invariant #4 (a human expert confirms before enforcement) symmetric for client input, not just AI suggestions.

## Consequences

- Attestation stays meaningful: a client never enforces a rule on the strength of attesting their own definition. Recorded in `CONTEXT.md`'s Attestation entry.
- Activation logic gains one predicate (`staff_reviewed` for `CLIENT_DEFINED` rows); the evaluator/backtest already filter `status='active'`, so an unreviewed rule that never reaches `active` is naturally invisible to them.
- Staff get a review surface — the existing T4 `policy_scope_exclusions` `status='defined'` records, or a "client-defined, pending review" rule filter, is the natural queue.
- A client whose definition is rejected sees it stay unreviewed/never-active; the rejection path reuses the existing draft-rule removal flow.

## Alternatives considered

- **Staff re-authors on review** (re-create as `signal_source='MANUAL'`, keep the client row as provenance) — cleanest provenance, but adds a copy step and dual records; the flag achieves the same gate with less bookkeeping.
- **Client attestation is sufficient** (no staff correctness gate) — simplest, but contradicts ADR 0012 D5 and lets an unsound client-authored rule reach enforcement unchecked. Rejected.
