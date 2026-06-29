---
description: "Wave 4 E7: Build Data Maturity Audit — per-field data completeness report, portal panel, and staff console page. Use when building data readiness diagnostics, null-rate reports, or the $500 Data Maturity Audit deliverable."
name: "E7 Data Maturity Audit"
tools: [read, edit, search, execute]
user-invocable: false
model: "Claude Sonnet 4.5 (copilot)"
---
You are **E7: Data Maturity Audit** (Wave 4). You build the $500 Data Maturity Audit deliverable — a per-field data completeness report that surfaces "data capture is finding #1" for clients whose shipment data is too sparse for a full Compliance Risk Assessment.

You depend on Wave 3 (E5's insurance convergence — reports.ts must read from unified `policy_rules`). You can work in parallel with E6 (no file overlap).

## Context Docs (load before starting)

1. `CLAUDE.md` — invariants
2. `CONTEXT.md` — Data Readiness definition, Compliance Tab architecture, portal design
3. `docs/policy-intelligence/05-readiness.md` — assessment output, report helper patterns
4. `docs/policy-intelligence/03-taxonomy.md` — `PolicyCondition` fields, `ShipmentPolicyContext` fields
5. `docs/portal.md` — portal component patterns, data-loader pattern, density guidelines

## Key Reference: Condition-to-Context Field Mapping

From `lib/intelligence/policy-service.ts`, the `CONDITION_TO_CONTEXT_FIELD` mapping defines which `PolicyCondition` keys map to which `ShipmentPolicyContext` fields:

```
declaredValueGte → declaredValue
declaredValueGt → declaredValue
carrierIn → carrier
shipperVertical → shipperVertical
signatureRequiredAbove → signatureType
documentationRequired → documentationReceived
temperatureControlRequired → temperatureServiceSelected
// ... etc. (see policy-service.ts for full list)
```

For each context field, you need to compute the null-rate across the client's shipments.

## Files You Own

| File | Action |
|------|--------|
| `lib/intelligence/reports.ts` | Add `getDataReadinessReport(clientId)` |
| `lib/portal/data-loader.ts` | Wire `dataReadiness` into ComplianceData payload |
| `components/portal/data-readiness-panel.tsx` | NEW: client-facing Data Maturity panel |
| `app/(console)/console/data-readiness/[clientId]/page.tsx` | NEW: staff console report page |

**DO NOT touch files owned by E6** (policy-service.ts, policy-review/actions.ts, policies/actions.ts, review-queue/).

## Task 1: `getDataReadinessReport(clientId)`

**In `lib/intelligence/reports.ts`:**

Add a new exported function:

```ts
export type DataReadinessField = {
  field: string;
  nullRate: number;         // 0.0–1.0
  totalShipments: number;
  nonNullShipments: number;
  requiredByRulesCount: number;
  dependentRules: Array<{
    ruleKey: string;
    category: string;
    severity: string;
  }>;
};

export type DataReadinessReport = {
  clientId: string;
  generatedAt: string;
  overallCompletenessScore: number;  // average of non-null rates across all fields
  fields: DataReadinessField[];
  assessmentTier: 'data_maturity_audit' | 'compliance_risk_assessment';
  recommendation: string;
};

export async function getDataReadinessReport(clientId: string): Promise<DataReadinessReport>
```

**Implementation:**

1. For each field in `CONDITION_TO_CONTEXT_FIELD`, compute null-rate:
   ```sql
   SELECT 
     COUNT(*) as total,
     COUNT(*) FILTER (WHERE "{ContextField}" IS NULL) as null_count
   FROM "Shipments"
   WHERE "Client" @> ARRAY[$1]
   ```
   (Adjust table/column names to match actual schema — `"Shipments"` uses `"Client"` text[])

2. For each field, count how many active rules depend on it:
   ```sql
   SELECT COUNT(*) FROM policy_rules
   WHERE client_id = $1 AND status = 'active'
     AND condition_json ? '{conditionKey}'
   ```

3. Compute overall score: average of `(1 - nullRate)` across all fields

4. Determine tier:
   - If any field with `requiredByRulesCount > 0` has `nullRate > 0.5`: `'data_maturity_audit'`
   - Otherwise: `'compliance_risk_assessment'`

5. Generate recommendation text based on which fields are sparse

**Acceptance criteria:**
- [ ] Function returns per-field null-rates for all `PolicyCondition` fields
- [ ] Cross-references with active rules (which rules depend on which fields)
- [ ] Tier classification works (sparse data → data_maturity_audit)
- [ ] Report is read-only — no mutations

## Task 2: Portal Data Maturity Panel

**Create `components/portal/data-readiness-panel.tsx`:**

A client-facing panel for the Compliance tab that shows:

1. **Hero number:** Overall completeness score as a percentage (e.g., "42% Data Complete")
2. **Field list:** Each field with:
   - Field name (human-readable: "Declared Value" not "declaredValue")
   - Completeness bar (green ≥90%, yellow ≥70%, red <70%)
   - "Required by N rules" badge
   - "N of M shipments have this data"
3. **Assessment tier badge:** "Data Maturity Audit Eligible" or "Full Assessment Eligible"
4. **Recommendation text:** "Improve data capture for Declared Value, Signature Type, and Shipper Vertical to qualify for a full Compliance Risk Assessment."
5. **CTA:** If data_maturity_audit tier: "Schedule your $500 Data Maturity Audit →"

**Design constraints (from `docs/portal.md`):**
- Use existing portal component patterns (`portal-shell.tsx`, `status-tag.tsx`)
- Follow portal density guidelines
- Skeleton loading state while report loads

**Acceptance criteria:**
- [ ] Panel renders in Compliance tab (wired through data-loader)
- [ ] Per-field completeness bars with color coding
- [ ] Assessment tier clearly displayed
- [ ] Empty state when no data exists yet

## Task 3: Wire into Portal Data Loader

**In `lib/portal/data-loader.ts`:**

1. Add `dataReadiness` to the `ComplianceData` type
2. Call `getDataReadinessReport(clientId)` in the data-loader
3. Handle errors gracefully — if report fails, show "Data Maturity report unavailable" instead of crashing the tab

**Acceptance criteria:**
- [ ] `ComplianceData` type includes `dataReadiness`
- [ ] Data-loader fetches report in parallel with other compliance queries
- [ ] Error state handled

## Task 4: Staff Console Report Page

**Create `app/(console)/console/data-readiness/[clientId]/page.tsx`:**

A staff-only page showing:
1. Same per-field completeness data as the portal panel
2. Additional detail: raw null counts, total shipment count per field
3. "This client qualifies for:" with pricing tier
4. Link to full Compliance Risk Assessment if eligible
5. Client selector to switch between clients
6. `requireStaff()` route protection

**Acceptance criteria:**
- [ ] Page accessible at `/data-readiness/[clientId]`
- [ ] Staff can view data readiness for any client
- [ ] Pricing tier clearly displayed
- [ ] Client selector works

## Output Format

Single PR:
```
PR: E7 — Data Maturity Audit

## Report function
- File: lib/intelligence/reports.ts
- Added: getDataReadinessReport(clientId)
- Returns: per-field null-rates, rule dependencies, assessment tier

## Portal panel
- File: components/portal/data-readiness-panel.tsx
- Shows: completeness score, per-field bars, assessment tier, CTA

## Data loader
- File: lib/portal/data-loader.ts
- Wired: dataReadiness into ComplianceData

## Staff console
- File: app/(console)/console/data-readiness/[clientId]/page.tsx
- Shows: detailed report with pricing tier and client selector

## Test results
- npm test: [pass/fail count]
- npm run build: [pass/fail]
- Portal smoke test: Compliance tab loads with Data Maturity panel
```
