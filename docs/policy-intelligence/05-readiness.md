# Policy Intelligence — Gateway Readiness Assessment

The Assessment is the consulting deliverable: it turns backtest output into the
client-facing story and the future gateway's configuration target. Stored in
`gateway_readiness_assessments` (see [`06-schema.md`](06-schema.md)).

## Assessment output

Each assessment includes:

- client and period;
- ruleset version used;
- total preventable margin loss;
- non-preventable recovery opportunity;
- uninsured / underinsured exposure;
- top violated policy rules;
- top preventable categories;
- recommended gateway controls;
- suggested rollout mode: advisory, require approval, or block.

It combines three inputs: `policy_backtest_results` (policy drift), `"Audit Results"`
gateway metadata (preventable financial loss), and `shipment_insurance_audit_results`
(uninsured exposure).

## Report helpers

Implemented in [`../../lib/intelligence/reports.ts`](../../lib/intelligence/reports.ts):

- `getGatewayReadinessReport()` — margin lost per month to preventable errors, ROI, top
  categories by dollars and count.
- `getTopGatewayRuleSuggestions()` — the pre-shipment rules to add first.
- `getInsuranceExposureReport()` — for high-value verticals: total declared value
  shipped, non-compliant value, uninsured exposure, and rules needed.

`getGatewayAssessment(clientId)` in `policy-service.ts` aggregates these with the latest
backtests for the `/gateway-readiness/[clientId]` route.

## The Compliance Intelligence Package (client-facing)

Do not send a spreadsheet of overcharges. Frame the deliverable in three parts — the
Audit→Diagnosis→Cure spine from [`README.md`](README.md):

1. **The Recovery Report (Audit / Evidence)** — "Here is the $X we recovered for you."
2. **The Risk Report (Policy Intelligence / Diagnosis)** — "Here is the $Y in
   *preventable* risk: you ship high-value items without required signatures, which voids
   your insurance."
3. **The Operational Fix (Gateway / Cure)** — "With the Gateway active, these N shipments
   would have been blocked until the signature requirement was confirmed."

Operational reporting can also score **SOP drift** per fulfillment center ("Warehouse A
follows the packaging rule 95% of the time; Warehouse B is at 60%").

## Human review and client safety

- Gateway tags may be rule-defaulted but must remain analyst-reviewable. For the first
  3–5 clients, analyst confirmation matters more than automation volume — those clients
  are the training dataset for the SaaS product.
- Client-facing summaries must not expose raw internal taxonomy labels without
  explanation. Add the client-safe readiness summary to the portal only **after** the
  internal taxonomy has been reviewed (tracked in [`../BACKLOG.md`](../BACKLOG.md)).
