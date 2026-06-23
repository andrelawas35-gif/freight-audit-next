# Policy Intelligence Glossary

Canonical vocabulary. When code or conversation uses one of these terms loosely,
correct it against this file. This is a glossary, not a spec — no implementation
details.

## Core entities

- **Client Policy** (`client_policies`) — the stable *container* for one governing
  arrangement a client has (e.g. "Acme jewelry insurance policy", "Acme FedEx master
  contract"). It is an identity, **not a version**. A renewal does not create a new
  Client Policy; it adds a new Document and a new Ruleset version under the same Policy.
  `policy_type` ∈ `carrier_contract`, `3pl_sla`, `insurance_policy`, `claims_policy`,
  `shipping_sop`, `packaging_standard`, `email_exception`.

- **Policy Document** (`policy_documents`) — one piece of *evidence* attached to a
  Client Policy: a PDF, tariff, rider, SOP, or email. Append-only. The renewed 2026
  contract is a **new** document row, never an edit of the 2025 one. Holds the stored
  file, extracted `raw_text`, and per-document effective dates.

- **Policy Rule** (`policy_rules`) — one structured IF/THEN constraint:
  `condition_json` (the IF) + `action_json` (the THEN decision/message/fix), plus
  `severity`, `category`, `clause_ref`, `rule_key`. The atomic unit the evaluator runs.

- **Policy Ruleset** (`policy_rulesets`) — the **version unit**. A named, versioned
  collection of Rules that is `draft` → `active` → `archived`. **The Ruleset is the one
  authority on "what was in force when"** — its `effective_from/to` window governs which
  rules apply to a shipment on a given date. Document and Client-Policy dates are
  descriptive metadata only; do not evaluate against them.

- **Backtest** (`policy_backtest_runs` + `policy_backtest_results`) — a reproducible run
  of one Ruleset against a historical period. Reads history; **never mutates** source
  shipments, invoices, or audit results. One result row per violated rule.

- **Gateway Readiness Assessment** (`gateway_readiness_assessments`) — the consulting
  *deliverable* that combines backtest drift, preventable audit loss, and uninsured
  exposure into a client-facing report. `draft` → `delivered` → `archived`.

## `client_policies` ≠ `client_insurance_policies`

These are **two different tables and two different layers**, and conflating them is the
most common mistake:

- `client_insurance_policies` — the **specialized, columnar** insurance table (coverage
  limits, deductible, allowed carriers, signature thresholds, etc.). Built first.
- `client_policies` — the **general umbrella** across all policy types, of which
  insurance is one (`policy_type = 'insurance_policy'`). The broader workflow
  (documents → rulesets → backtests) hangs off this.

Direction: the general `policy_rules` shape is the long-term evaluation target;
`insurance_policy_rules` remains a specialized table the evaluator also reads. See
[`06-schema.md`](06-schema.md).

## Key concepts

- **Preventable (by gateway)** — a loss the future pre-shipment gateway *could* have
  stopped by warning, requiring, or blocking before the label was purchased. The
  opposite is a carrier-side error (e.g. a fuel-surcharge miscalculation) that no
  pre-shipment control would catch. Tagged `PREVENTABLE_BY_GATEWAY` /
  `NON_PREVENTABLE_BY_GATEWAY` / `UNKNOWN`. See [`03-taxonomy.md`](03-taxonomy.md).

- **Compliance Drift** — operational behavior diverging over time from the encoded
  rules (e.g. a warehouse silently stops following a packaging standard). Surfaced as
  repeated backtest violations, often reported as a per-fulfillment-center compliance
  score.

- **The Linked Audit** — treating a shipment as a *legal event*, not just a set of
  charges: cross-referencing actual shipping behavior against the client's **insurance**
  requirements to flag shipments that were "compliant with shipping rules" but **voided
  coverage** (wrong carrier, missing signature, exceeded declared-value limit). This is
  the competitive moat, and it depends on **claims history** as ground truth — see
  [`01-ingestion.md`](01-ingestion.md#historical-data-claims-as-ground-truth).

- **Compliance Intelligence Package** — the three-part client deliverable: the Audit
  (dollars recovered), the Diagnosis (preventable risk identified), the Cure (gateway
  controls that would stop it). See [`05-readiness.md`](05-readiness.md).

- **Gateway decision / action** — the enforcement verb a rule resolves to: `ALLOW`,
  `WARN`, `BLOCK`, `REQUIRE_APPROVAL`, `REQUIRE_DOCUMENTATION`. Canonical list in
  [`03-taxonomy.md`](03-taxonomy.md).
