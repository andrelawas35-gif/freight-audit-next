# Policy Intelligence — Taxonomy Discovery (a.k.a. "Schema Evolution")

> **STATUS: PLANNING (2026-06-26).** Live design record from a grilling session. Nothing
> implemented. **LOCKED** = settled; **OPEN** = being resolved. When a decision ships,
> move status to `../CHANGELOG.md` and open work to `../BACKLOG.md`. Do not duplicate
> status checklists here.
>
> Naming note: the original request called this "Dynamic Schema Evolution / `09_...md`".
> Renamed to **Taxonomy Discovery** and numbered to this module's convention, because the
> mechanism is **not** runtime schema/DDL change (see OPEN-Q1 / the reframe below).

## What this is

When a client's policy contains a constraint the system has **never tracked before**, the
extraction layer must not (a) force it into a mismatched existing variable, nor (b) drop
it. It captures the constraint as a **suggest-only candidate** for a possible new taxonomy
variable, which a staff admin may later promote into the platform's permanent vocabulary —
making future clients' extraction smarter. This is the same suggest-only learning loop as
`ingestion_exceptions` → `learned_mappings`, applied to policy variables.

## The reframe (why the pasted proposal is wrong for this codebase)

The pasted "Dynamic Schema Evolution" proposal assumes facts that are false here:

1. **Its flagship example is already modeled.** `TEMPERATURE_CONTROL_MISSING`, the
   `fine_art` vertical, and a `temperature_control_required` shipment field already exist
   (`03-taxonomy.md`). "Fine art at 68°F" is not novel for us.
2. **Capture ≠ enforce.** `PolicyCondition` in `lib/intelligence/policy-evaluator.ts` is a
   **closed key set** and currently has **no temperature condition key** — so even our
   *existing* `TEMPERATURE_CONTROL_MISSING` category cannot be evaluated as "block if
   temp > 68". An auto-added JSONB key the deterministic evaluator does not recognize is
   **silently inert**. "Every new client automatically makes the system smarter" is false
   without engineering: a captured variable does nothing until the evaluator learns it.
3. **Runtime DDL / auto-propagation attacks our invariants.** The taxonomy is **code, not
   data** (`taxonomy.ts`, `as const`; `03-taxonomy.md`: "the code wins"). The suggest-only
   trust boundary (`02-extraction.md`) depends on a **closed enum** so a malicious client
   PDF "must be unable to produce an enforced rule". Auto-generating keys/columns from
   client documents is precisely the poisoning attack that boundary exists to stop, and
   runtime `ALTER TABLE` would bypass migration discipline (`../data-layer.md`), Drizzle
   authority, and the tenant RLS in `../data-protection.md`.

### Three levels of "novel variable" (the proposal conflates them)

| Level | Example | Handled how today | New work? |
|-------|---------|-------------------|-----------|
| **L1** new *value* for existing variable | "declared value limit is $5,000" | `condition_json` value on a `policy_rule` | None |
| **L2** new *rule* of existing variables | "block UPS for jewelry > $5k" | a new `policy_rule` (reuse `rule_key`) | None |
| **L3** genuinely new *variable/category* | "must be transported by helicopter only" | **not representable** — no condition key, maybe no category | This doc. **Rare.** |

Only **L3** is "schema evolution." It is rare, and it is the only case this doc designs.

## Decisions

### D1 — Storage substrate: **JSONB + candidate registry, no runtime DDL** — LOCKED
- **Values** live in the existing `condition_json` **JSONB** — a new condition key like
  `{"maxTemperatureF": 68}` stores today with **zero migration**. Storage was never the
  constraint; the evaluator not reading the key is (see D5/OPEN-Q5).
- **Discovered-variable metadata** lives as **rows** in a new `policy_taxonomy_candidates`
  registry table: proposed `rule_key`, inferred datatype + validation bounds, source
  clause + lineage (`document_id`, `clause_ref`), surfacing `client_id`, and `status`
  (`candidate` → `approved` → `promoted` / `rejected`). This mirrors `ingestion_exceptions`.
- **Runtime DDL is forbidden.** No AI/automated `ALTER TABLE`. Promotion of a variable to a
  first-class SQL column (for hot query/index dimensions only) is a **rare, engineer-driven
  normal migration** (`../data-layer.md` pattern) + a `PolicyCondition` change + evaluator
  logic — a reviewed PR, never an extraction side effect.

**Rejected:** runtime `ALTER TABLE ADD COLUMN` per discovered variable (the pasted
proposal). It solves a non-problem (JSONB already stores arbitrary keys) and breaks
migration discipline, Drizzle authority, RLS column-policy review, and the suggest-only
boundary (a client PDF must never mutate global structure).

### D2 — Detection & staging: **reuse the extractor; an orphan constraint is a 4th tripwire** — LOCKED
No new pipeline, not even a new job type — discovery is an outcome of the existing
`policy_extract` worker (`02-extraction.md`).

1. **Detection = a specific stage-4 (Zod) outcome:** the extractor produced a **grounded**
   constraint (`clause_ref` text found in document `raw_text`) that maps to **no** existing
   `category` or `PolicyCondition` key → write a `policy_taxonomy_candidates` row instead of
   discarding. (Grounded + unmappable = L3 candidate, not garbage.)
2. **Mandatory frontier escalation** (reuses the schema-validation-failure escalation): the
   frontier model must first try hard to map the constraint to an existing category/key
   (is "climate-controlled" just `TEMPERATURE_CONTROL_MISSING`?) before it is accepted as
   novel. Kills the "false novelty" failure mode where an existing concept is in disguise.
3. **Grounding is non-negotiable.** Ungrounded "novel variable" = hallucination, hard-reject,
   never staged. Single most important guard against the registry becoming a garbage pile.
4. **Dedupe + frequency rank.** If the candidate `rule_key` already exists (any client, any
   status), increment `seen_count` / attach lineage rather than duplicate. Cross-client
   frequency **is** the moat signal (surfaced by 8 clients ≫ surfaced once).
5. **Stays `status='candidate'`, fully inert** — never a draft rule, never enforced, never
   backtested. One level below even a draft `policy_rule`.

**Registry is Tier-0 metadata only** (`../data-protection.md` D3): it records that a
"max temperature" *concept* exists and its inferred type/bounds — **never** a client's
specific `68°F` value. The cross-client `seen_count` is a count, not a value, so it does
not leak. The client's actual threshold stays in that client's `condition_json` (Tier-2).

### D3 — Promotion governance: **two-stage ladder, local auto / global staff-gated, value-free** — LOCKED
The moat is real but narrower and safer than the pitch: **the platform accumulates the
*vocabulary of risks* across the industry; it never pools any client's *values*.** "The
platform learns the *questions* to ask, never any client's *answers*."

1. **Local first, always.** A discovered constraint is immediately usable **for its own
   client** as a JSONB `condition_json` key on a *draft* `policy_rule` (still staff-confirmed,
   invariants 4/10). Client A gets value day one without touching global vocabulary. This
   decouples "Client A benefits" from "everyone benefits" — the fusion of those is what
   forces the proposal's dangerous auto-propagation.
2. **Global promotion is a separate, explicit Aurelian-staff action** — never the client,
   never the AI, never automatic on approval. This is the consulting-handover model
   (`README.md`: clients never author rules); promoting global vocabulary is the strongest
   authoring act, so it is the **most** gated.
3. **Value-free by construction.** What goes global is the abstract variable
   (`maxTemperatureF`, integer, bounds) — never Client A's `68`. Registry is Tier-0, so
   there is structurally nothing to leak.
4. **Poisoning guard = the closed-enum boundary, preserved.** Promotion *proposes* a
   reviewed change; it never lets a PDF mutate the live taxonomy (active vocabulary stays
   code-authoritative — see D4).
5. **"Smarter for future clients" = better extraction recall.** Once promoted, the
   extractor's known-key list includes the variable, so the next client's contract is
   *scanned* for it automatically. Network effect = knowing to look; leaks nothing.

**Privileged capability:** global promotion is gated behind an explicit
**`taxonomy_admin`** capability, distinct from plain `staff` (auth today is only
`staff` vs `client`, `../auth.md`). Add it now even if one person holds it — cheap now,
expensive to retrofit once the moat has value. Plain `staff` may *capture/confirm local*;
only `taxonomy_admin` may *promote global*.

### D4 — Authority split by lifecycle: **candidates in data, active vocabulary in code** — LOCKED
- **Candidates → data.** `policy_taxonomy_candidates` (discovery, dedupe, `seen_count`,
  lineage, `status`) is the single source of truth for *candidate* vocabulary.
- **Active/enforceable → code.** `lib/intelligence/taxonomy.ts` (`as const`) stays the
  single source of truth for *active* vocabulary, per `03-taxonomy.md` ("code wins").
- **Promotion = the data→code transition**, gated by `taxonomy_admin` (D3): it opens a
  reviewed PR (migration + `taxonomy.ts` diff + the `PolicyCondition`/evaluator change from
  D5). No overlap, no split-brain — a value is in exactly one state and promotion is the
  only door.

**Rejected:** runtime-mutable, data-authoritative active taxonomy. A live row insert
widening the active enum re-opens the injection surface the suggest-only boundary closed
(`02-extraction.md`), and cannot add a `PolicyCondition` key or evaluator logic — so it
would mint named-but-inert variables (the Finding-2 trap). The "Master Taxonomy" is real:
it is `taxonomy.ts` fed by the candidate registry, not a live-mutable table.

### D5 — Capture vs. enforce: **explicit lifecycle; enforcement is a separate engineering milestone** — LOCKED
A promoted variable can be in four states; the proposal assumes promotion jumps to the last
one. It does not.

| State | Meaning | Cost |
|-------|---------|------|
| **captured** | row in `policy_taxonomy_candidates`; concept is known | automatic (D2) |
| **extractable** | in the extractor's known-key list; new contracts are scanned for it | promotion (D3/D4) |
| **storable** | a `condition_json` key a client's rule can carry | free (JSONB) — even pre-promotion |
| **enforceable** | the **deterministic** evaluator acts on it (block/warn + backtest score) | **engineer writes `PolicyCondition` key + evaluator branch + backtest case** |

1. **Explicit lifecycle** `captured → extractable → enforceable` (+ `rejected`) tracked on
   the variable. The status *is* the honesty mechanism: "recorded" vs "will block".
2. **Promotion reaches *extractable*, not *enforceable*.** Enforcement is a separate,
   explicitly-flagged PR (`PolicyCondition` key + evaluator branch + backtest case). Never
   conflated in UI or client deck. `policy-evaluator.ts` has no generic predicate engine and
   the backtest must stay deterministic (`04-backtest.md`), so an unrecognized key is inert.
3. **Generic JSON predicate evaluator = the tempting wrong turn — deferred.** It would have
   to stay deterministic/auditable (CISO + backtest), and a general expression evaluator over
   client JSON is a large correctness/security surface. At 3–5 clients, hand-write the handful
   of evaluator branches. Future scaling option, not launch.
4. **Client-facing language tracks state.** captured → "we've noted this requirement";
   enforceable → "the gateway will block violations". Never promise the second in the first
   state (`../data-protection.md` honesty discipline).
5. **Staff dashboard:** ranked queue of `captured` candidates by cross-client `seen_count`, so
   `taxonomy_admin` promotes what the market is actually asking for first.

## Phase-1 implementation checklist (when planning ends)

1. `policy_taxonomy_candidates` table (migration per `../data-layer.md`): `rule_key`,
   inferred `datatype`/bounds, lineage (`document_id`, `clause_ref`), surfacing `client_id`,
   `seen_count`, `lifecycle_status` (`captured|extractable|enforceable|rejected`).
   Tier-0 — **no client values.** Add `client_id`-keyed lineage but RLS-exempt as Tier-0
   aggregate metadata (staff-only surface).
2. Extractor stage-4 change (`02-extraction.md`): grounded + unmappable → frontier escalation
   that attempts existing-key mapping → on confirmed novelty, upsert candidate (dedupe by
   `rule_key`, bump `seen_count`).
3. `taxonomy_admin` capability on `app_users` (distinct from `staff`); promotion action.
4. Staff review UI: ranked candidate queue; promote/reject; promote opens the data→code PR.
5. Enforcement is tracked **separately** per promoted variable (own ticket): add
   `PolicyCondition` key + evaluator branch + backtest case.
6. **Concrete first ticket regardless of discovery:** add a `temperatureMax`/
   `temperatureControlRequired` key to `PolicyCondition` + evaluator logic — closes the
   existing capture/enforce gap (`TEMPERATURE_CONTROL_MISSING` category exists but is
   currently inert).

## Related docs

- `02-extraction.md` — the suggest-only extractor and its tripwire/escalation model.
- `03-taxonomy.md` — the closed enums this loop proposes to extend (code is authority).
- `00-glossary.md` — vocabulary.
- `../data-protection.md` — Tier-0/Tier-1 BI boundary and cross-tenant leak rules.
