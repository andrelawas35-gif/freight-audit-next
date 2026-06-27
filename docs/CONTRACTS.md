# CONTRACTS.md — Frozen Shared Contract

> **Version:** contracts-v1
> **Date:** 2026-06-26
> **Status:** FROZEN
> **Owner:** E1 · Keystone / Platform
>
> This is the frozen shared contract for the Policy Intelligence + Gateway build wave.
> It is the ONE cross-cutting doc every engineer reads before starting work.
>
> **Change protocol (BUILD-PLAN.md D4):**
> - *Additive* changes (new optional field, enum value, table): low-ceremony → version bump
>   (v1→v1.1), notify dependents.
> - *Breaking* changes (rename, type change, removal): hard-freeze — Controller approval
>   required, all dependents re-validated.
> - **All changes route through the Controller** as Change Requests. Only E1 (Keystone)
>   writes these files. Code + doc move together — code wins, doc follows.

## 1. Schema — New Tables (migration `0006_keystone_contract.sql`)

### `gateway_decisions` (Tier-2, RLS-protected)

Forensic decision log for the Gateway precheck service (`08-gateway.md` D6). One row per
`POST /v1/precheck` evaluation.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `text PK` | `'gd' || replace(gen_random_uuid()::text, '-', '')` |
| `client_id` | `text NOT NULL` | Tenant scope — from API key, never request body |
| `correlation_id` | `text NOT NULL` | Observability correlation ID |
| `request_json` | `jsonb` | Full precheck payload (`ShipmentPolicyContext`) |
| `decision` | `text NOT NULL` | Effective decision (ALLOW\|WARN\|BLOCK\|REQUIRE_APPROVAL\|REQUIRE_DOCUMENTATION) |
| `enforced` | `boolean NOT NULL DEFAULT false` | Whether the decision was enforced (vs shadow) |
| `violations` | `jsonb` | Full `PolicyDecision[]` for forensics |
| `ruleset_version` | `text` | Which ruleset produced the verdict |
| `degraded` | `boolean NOT NULL DEFAULT false` | True when evaluated in degraded/fail-open mode |
| `ruleset_snapshot_id` | `text` | Cache snapshot lineage |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

**Indexes:** `(client_id, created_at DESC)`, `(correlation_id)`.
**RLS:** `USING (client_id = current_setting('app.current_tenant', true))` + FORCE ROW LEVEL SECURITY.

### `policy_taxonomy_candidates` (Tier-0, no RLS — structural metadata)

Suggest-only loop for novel (L3) policy variables (`07-schema-evolution.md`). No `client_id` —
this is abstract structural metadata, readable globally via `getSql()`.

| Column | Type | Purpose |
|--------|------|---------|
| `id` | `text PK` | `'ptc' || replace(gen_random_uuid()::text, '-', '')` |
| `rule_key` | `text NOT NULL` | Stable machine key for the candidate variable |
| `inferred_datatype` | `text` | e.g. `numeric`, `text[]`, `boolean` |
| `inferred_bounds` | `jsonb` | Min/max/enum values if inferrable |
| `lineage` | `jsonb` | Source document/clause that surfaced this |
| `surfacing_client_id` | `text` | Which client's data surfaced it (not a tenant column) |
| `seen_count` | `integer NOT NULL DEFAULT 1` | Cross-tenant occurrence count |
| `lifecycle_status` | `text NOT NULL DEFAULT 'candidate'` | candidate\|promoted\|rejected\|duplicate |
| `notes` | `text` | Analyst notes |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `reviewed_by` | `text` | Staff who reviewed |
| `reviewed_at` | `timestamptz` | When reviewed |

**Index:** `(lifecycle_status, seen_count DESC)`.

### Attestation columns on `policy_rulesets` (DG1)

| Column | Type | Purpose |
|--------|------|---------|
| `attested_by` | `text` | Who attested (client email / broker name) |
| `attested_at` | `timestamptz` | When attested |
| `scope_statement` | `text` | Written scope boundary per DG2 |

**`status` valid values:** `draft` → `client_attested` → `active` → `archived`.
`client_attested` is the DG1 ratification state between draft and active.

## 2. Evaluator Contract (`lib/intelligence/policy-evaluator.ts`)

These types are FROZEN. Additive changes only via Change Request to Controller → E1.

### `ShipmentPolicyContext`

```ts
type ShipmentPolicyContext = {
  clientId: string;
  shipmentId?: string | null;
  invoiceId?: string | null;
  auditResultId?: string | null;
  carrier?: string | null;
  serviceLevel?: string | null;
  destinationZip?: string | null;
  destinationCountry?: string | null;
  destinationRiskTier?: string | null;
  shipperVertical?: string | null;
  commodityType?: string | null;
  declaredValue?: number | null;
  insuredValue?: number | null;
  insuranceProvider?: string | null;
  signatureType?: string | null;
  packageType?: string | null;
  documentationReceived?: string[] | null;
  preventableLoss?: number | null;
  uninsuredExposure?: number | null;
};
```

### `PolicyCondition`

```ts
type PolicyCondition = {
  declaredValueGte?: number;
  declaredValueGt?: number;
  declaredValueLte?: number;
  insuredValueLtDeclared?: boolean;
  carrierIn?: string[];
  carrierNotIn?: string[];
  serviceIn?: string[];
  serviceNotIn?: string[];
  shipperVertical?: string | string[];
  commodityType?: string;
  commodityIn?: string[];
  destinationCountryIn?: string[];
  destinationZipIn?: string[];
  destinationRiskTierIn?: string[];
  signatureRequiredAbove?: number;
  signatureTypeIn?: string[];
  documentationRequired?: string[];
  packageTypeIn?: string[];
};
```

### `PolicyDecision`

```ts
type PolicyDecision = {
  decision: GatewayAction;
  ruleId: string | null;
  ruleKey: string;
  category: string;
  message: string;
  clauseRef?: string;
  suggestedFix?: string;
  confidence: number;
  preventableLoss: number;
  uninsuredExposure: number;
};
```

### `PolicyRuleForEvaluation`

```ts
type PolicyRuleForEvaluation = {
  id: string;
  clientId: string;
  rulesetId: string;
  ruleKey: string;
  category: string;
  conditionJson: PolicyCondition;
  actionJson: PolicyAction;
  severity: 'info' | 'warn' | 'block';
  status: PolicyStatus;
  clauseRef: string | null;
};
```

**Evaluator entry point:** `evaluatePolicyContext({ context, rules, mode?, includeDraft? }): PolicyDecision[]`
— pure, synchronous, deterministic. No I/O. Default-allow on empty match.

## 3. Taxonomy Enums (`lib/intelligence/taxonomy.ts`)

### Gateway Preventability
`PREVENTABLE_BY_GATEWAY` | `NON_PREVENTABLE_BY_GATEWAY` | `UNKNOWN`

### Gateway Categories (15)
`DIM_WEIGHT_PADDING` | `BOX_SIZE_MISMATCH` | `WRONG_SERVICE_LEVEL` | `ADDRESS_VALIDATION` |
`RESIDENTIAL_FLAG` | `CARRIER_SELECTION` | `ACCESSORIAL_AVOIDABLE` | `LATE_SHIPMENT_RISK` |
`DUPLICATE_ORDER_FLOW` | `THREE_PL_PICK_PACK_ERROR` | `STORAGE_PROCESS_ERROR` |
`CARRIER_BILLING_GLITCH` | `FUEL_SURCHARGE_ERROR` | `CONTRACT_RATE_ERROR` | `DATA_REQUIRED`

### Gateway Actions (5)
`ALLOW` | `WARN` | `BLOCK` | `REQUIRE_APPROVAL` | `REQUIRE_DOCUMENTATION`

### Gateway Signal Sources (3)
`RULE_DEFAULT` | `ANALYST_REVIEW` | `AI_SUGGESTED`

### Insurance Risk Categories (21)
`DECLARED_VALUE_MISMATCH` | `UNDER_INSURED_SHIPMENT` | `OVER_INSURED_SHIPMENT` |
`EXCLUDED_COMMODITY` | `INVALID_CARRIER_SERVICE` | `MISSING_SIGNATURE_REQUIRED` |
`HIGH_RISK_DESTINATION` | `PACKAGING_NON_COMPLIANT` | `CHAIN_OF_CUSTODY_GAP` |
`POLICY_LIMIT_EXCEEDED` | `CLAIM_WINDOW_RISK` | `THIRD_PARTY_INSURANCE_REQUIRED` |
`CARRIER_DECLARED_VALUE_NOT_ALLOWED` | `DOCUMENTATION_MISSING` | `APPRAISAL_REQUIRED` |
`SERIAL_NUMBER_REQUIRED` | `TEMPERATURE_CONTROL_MISSING` | `REGULATED_ITEM_NON_COMPLIANT` |
`DESTINATION_RESTRICTED` | `APPROVED_CARRIER_REQUIRED` | `APPROVED_SERVICE_REQUIRED`

### High-Value Verticals (13)
`jewelry` | `fine_art` | `luxury_goods` | `electronics` | `pharma` | `medical_device` |
`precious_metals` | `regulated_goods` | `wine_spirits` | `aerospace_parts` |
`event_equipment` | `sensitive_documents` | `other`

## 4. RLS Policies (Phase-1 Table Set)

All policies use `text` comparisons, never `::uuid`.

| Table | Tenancy Column | Policy Form | FORCE RLS |
|-------|---------------|-------------|-----------|
| `"Invoices"` | `"Clients" text[]` | `current_setting('app.current_tenant', true) = ANY("Clients")` | ✓ |
| `"Audit Results"` | `"Client" text[]` | `current_setting('app.current_tenant', true) = ANY("Client")` | ✓ |
| `"Disputes"` | `"Client" text[]` | `current_setting('app.current_tenant', true) = ANY("Client")` | ✓ |
| `client_insurance_policies` | `client_id text` | `client_id = current_setting('app.current_tenant', true)` | ✓ |
| `insurance_policy_rules` | `client_id text` | `client_id = current_setting('app.current_tenant', true)` | ✓ |
| `policy_rules` | `client_id text` | `client_id = current_setting('app.current_tenant', true)` | ✓ |
| `policy_documents` | `client_id text` | `client_id = current_setting('app.current_tenant', true)` | ✓ |
| `client_policies` | `client_id text` | `client_id = current_setting('app.current_tenant', true)` | ✓ |
| `gateway_decisions` | `client_id text` | `client_id = current_setting('app.current_tenant', true)` | ✓ |

**CHECK constraints** on array-tenancy tables enforce `cardinality = 1`.

## 5. Connection Pattern (`lib/db.ts`)

Two paths, documented in `lib/db.ts`:

| Helper | Driver | Role | Purpose |
|--------|--------|------|---------|
| `getSql()` | HTTP (`neon()`) | `neondb_owner` | Staff/console/aggregate BI — cross-tenant, no RLS |
| `getTenantSql(clientId)` | Pooled (`Pool`) | `app_tenant` | Tier-2 protected reads — RLS-enforced, `SET app.current_tenant` per checkout |

The restricted `app_tenant` role is **not the table owner** — RLS applies.
`FORCE ROW LEVEL SECURITY` ensures even the owner is gated.

## 6. Data Classification (data-protection.md D3)

| Tier | Scope | Connection | Examples |
|------|-------|-----------|----------|
| 0 — Structural | Global, no `client_id` | `getSql()` | `learned_mappings`, `policy_taxonomy_candidates`, taxonomy enums |
| 1 — Aggregated | Cross-tenant, k≥5 | Audited analytics path | Benchmarks, win-rates |
| 2 — Raw tenant | Never leaves namespace | `getTenantSql()` | Invoices, disputes, policy_rules, gateway_decisions |

## 7. Related

- `docs/data-protection.md` — Full isolation design, threat model, D1–D5.
- `docs/policy-intelligence/06-schema.md` — All 11 policy/insurance/gateway tables.
- `docs/policy-intelligence/03-taxonomy.md` — Canonical enum documentation.
- `docs/policy-intelligence/04-backtest.md` — Evaluator contract, backtest design.
- `docs/BUILD-PLAN.md` — Multi-engineer execution plan, D1–D5.
