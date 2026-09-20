# Disputes Pipeline

## Purpose

Disputes convert approved audit findings into carrier/client recovery workflows. They also close the learning loop: confirmed outcomes tell us which audit findings were valid, which carrier behaviors repeat, and which pre-shipment gateway rules would have prevented margin loss or uninsured exposure.

## Workflow Stages

Canonical dispute state machine (ADR 0005, `lib/disputes/state-machine.ts`):

```text
pending_review → filed → carrier_responded → won
                   ↓              ↓              ↓
                closed        dismissed      closed
                   ↑              ↑
                partial ←─────────┘
                   ↓
               appealed → carrier_responded
```

All eight statuses:

| Status | Description |
|--------|-------------|
| `pending_review` | Finding flagged, awaiting staff review before filing |
| `filed` | Dispute submitted to carrier |
| `carrier_responded` | Carrier has replied (accept, deny, partial, counter) |
| `won` | Carrier accepted the dispute — recovery confirmed |
| `dismissed` | Dispute rejected after review or carrier denial |
| `partial` | Carrier offered partial recovery |
| `appealed` | Staff appealed a carrier response |
| `closed` | Terminal — no further action |

## Server Actions (`app/(console)/disputes/actions.ts`)

- `parseResponse()` - paste carrier email -> Claude classifies outcome. Suggest-only.
- `applyOutcome()` - human confirms outcome -> update dispute status + record learning label.
- `advanceStage()` - move to next pipeline stage, auto-set dates.
- `addDisputeNote()` - append timestamped note to resolution notes.
- `markCarrierResponded()` - reset silent-days clock.

## Queue Actions (`app/(console)/queue/actions.ts`)

- `setReviewStatus()` - mark finding as New/Reviewing/Approved/Dismissed.
- `fileDispute()` - create Disputes record from Audit Result.
- `fileDisputesBulk()` / `dismissBulk()` / `approveBulk()` - batch operations.

All queue actions require staff role.

## Human-In-The-Loop Rules

- AI may classify carrier responses but must not auto-apply outcomes.
- AI/data clerk may suggest mapping or gateway categories but must not silently commit them.
- Staff must approve/dismiss findings before disputes are filed.
- Gateway taxonomy can be prefilled by rules, but analyst review should be possible before using it in sales/reporting.

## AI Carrier Response Parser (`lib/disputes/response-parser.ts`)

- Claude Haiku 4.5, structured output JSON.
- Classifies: won, partial, denied, escalated, unclear.
- Extracts recovery amount, confidence, and reasoning.
- No-ops without `ANTHROPIC_API_KEY`.

## Outcome Learning (`lib/disputes/outcomes.ts`)

- `recordOutcomeLabel()` persists confirmed outcome with rule code, carrier, amounts.
- `getRuleOutcomeStats()` aggregates win rate, recovery, denied amounts per rule.
- Displayed on Engine page as rule performance.

Gateway-readiness reports should join dispute outcomes back to behavioral tags so the roadmap can distinguish:

- valid preventable savings;
- false positives;
- carrier-denied claims;
- low-confidence rule suggestions;
- non-preventable recovery opportunities.

## Gateway and Insurance Feedback

For every dispute resolved from a preventable finding, capture:

- whether the gateway tag was confirmed;
- whether rule suggestion would have prevented the issue;
- amount recovered;
- amount denied;
- amount still exposed;
- carrier denial reason;
- for jewelry clients, policy clause or documentation failure.

This feedback should tune future gateway actions:

- `ALLOW`
- `WARN`
- `BLOCK`
- `REQUIRE_APPROVAL`
- `REQUIRE_DOCUMENTATION`

## Filing Templates (`lib/templates.ts`)

Per-rule dispute letter templates with placeholders:

- `{pro}`
- `{invoice}`
- `{recover}`
- `{svc}`
- `{days_late}`

Current coverage:

- `DIM_WEIGHT_TRAP`
- `PHANTOM_ACCESSORIAL`
- `DUPLICATE_TRACKING`
- `SLA_FAILURE`
- `LTL_SLA_FAILURE`

Future jewelry templates should cite insurance policy clauses and required evidence.

## Key Files

| File | Purpose |
|------|---------|
| `lib/disputes/response-parser.ts` | AI response classification |
| `lib/disputes/outcomes.ts` | Outcome learning loop |
| `lib/templates.ts` | Dispute letter templates |
| `lib/format.ts` | Stage definitions + formatting |
| `app/(console)/disputes/actions.ts` | Dispute server actions |
| `app/(console)/queue/actions.ts` | Queue server actions |
| `components/console/response-parser.tsx` | Response parser UI |
