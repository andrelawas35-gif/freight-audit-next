# Gateway Readiness → moved

This document has been split into the cohesive **Policy Intelligence** module to remove
duplication and make the concern lazily loadable as a single unit.

➡️ **Start at [`docs/policy-intelligence/README.md`](policy-intelligence/README.md).**

| You were looking for | Now in |
|----------------------|--------|
| Strategy, 4-step pipeline, console routes | [`policy-intelligence/README.md`](policy-intelligence/README.md) |
| Vocabulary (Policy vs Ruleset vs Rule, "preventable", Linked Audit) | [`policy-intelligence/00-glossary.md`](policy-intelligence/00-glossary.md) |
| Policy document intake, insurance onboarding fields | [`policy-intelligence/01-ingestion.md`](policy-intelligence/01-ingestion.md) |
| Rule shape, `rule_key`, AI suggest-only boundary | [`policy-intelligence/02-extraction.md`](policy-intelligence/02-extraction.md) |
| **All enums** (gateway categories, insurance risk categories, actions, verticals) | [`policy-intelligence/03-taxonomy.md`](policy-intelligence/03-taxonomy.md) |
| Evaluator contract, backtest, gap analysis | [`policy-intelligence/04-backtest.md`](policy-intelligence/04-backtest.md) |
| Readiness Assessment output, Compliance Intelligence Package | [`policy-intelligence/05-readiness.md`](policy-intelligence/05-readiness.md) |
| Policy/gateway/insurance table schemas | [`policy-intelligence/06-schema.md`](policy-intelligence/06-schema.md) |

The behavioral-tag requirement, taxonomy lists, and insurance data points that used to
live here are now single-sourced in `03-taxonomy.md` and `06-schema.md`.
