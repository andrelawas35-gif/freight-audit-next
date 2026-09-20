# Facility Intelligence and Agent Operating Model

- **Status:** Decision summary from `/grill-with-docs`
- **Date:** 2026-07-10
- **Related:** [`CONTEXT.md`](../CONTEXT.md),
  [`ADR 0017`](adr/0017-human-governed-agent-runtime.md),
  [`MISSION.md`](../MISSION.md)

## Executive summary

Aurelian will test a manually produced, public-record **Facility Intelligence Dossier** as
top-of-funnel sales ammunition. The physical Facility—not its current operator—is the durable
subject. The first ten dossiers are a one-week, Tier 1 experiment performed outside the production
application. Every externally used match, source, assertion, posture, and dossier sentence receives
human review. The dossier is not initially sold, scored, or treated as proof of future loss; it earns
conversations that lead to Aurelian shipment-data audits and compliance assessments.

If the experiment validates both evidence availability and commercial usefulness, Aurelian may build
a shared public Facility Intelligence registry plus tenant-confidential client/prospect relationships.
Public signals remain a separate contextual axis and never directly alter Warehouse Scorecards,
financial audit findings, or Gateway enforcement.

Aurelian will also begin an agent program with one **Facility Research Copilot** in a separate ADK
application boundary under `agents/`. It submits candidates and artifacts through narrow authenticated
Next.js tools, has no direct Neon access, and cannot publish, message, change code, deploy, or activate
governed business actions. Agent improvement is an offline, versioned, human-approved learning loop;
online self-modification and early reinforcement learning are rejected.

## 1. Commercial purpose

The initial dossier is a sales-enablement asset, not a standalone product. Its job is:

> Earn qualified conversations that convert into shipment-data audits.

The commercial path is:

```text
Public Facility signal
→ permission-based prospect outreach
→ prospect requests the cited dossier
→ discovery about what public records cannot show
→ shipment-data request
→ Aurelian audit / compliance assessment
→ first-party Facility findings
→ governed Gateway recommendations
```

The dossier establishes relevance but does not predict loss, certify safety or compliance, provide a
credit opinion, or establish that an allegation is true.

## 2. Artifact boundaries

### Facility Research Brief — internal

May contain:

- Confirmed evidence
- Unresolved match candidates
- Bounded negative searches
- Search notes and aliases
- Analyst hypotheses
- Soft leads
- Prospect-specific outreach context
- Contradictory evidence

Unconfirmed material in the Research Brief cannot support external claims.

### Facility Intelligence Dossier — external

A prospect-neutral, point-in-time, externally shareable two-page assessment containing only:

- Human-confirmed matches
- Cited assertions
- Relevant event and verification dates
- Procedural posture
- Disclosed methodology and limitations
- Neutral analyst judgment
- A correction channel

### Audit Opportunity Note — sales-specific

A separate prospect-specific artifact explaining:

- Why the Facility matters to the prospect
- How the Prospect–Facility Relationship was established
- What shipment-data tests Aurelian recommends
- The audit call to action

Keeping the dossier prospect-neutral preserves registry reuse and avoids exposing confidential or
inferred Facility usage.

## 3. Facility identity model

### Primary subject

The canonical subject is the physical **Facility**, not the operator, owner, parent, brand, or current
3PL. A Facility receives a durable internal identity independent of any one address representation.

Address information is matching evidence and may change. Preserve:

- Canonical normalized address
- Raw address variants
- Address history and effective dates
- Coordinates
- Parcel/building identifiers where available
- Site, building, suite, and Unit distinctions
- Verification source and confidence

A **Site** may contain multiple Facilities. A **Unit** may be a separately occupied subdivision of a
Facility. When public evidence cannot resolve the spatial scope, disclose the uncertainty.

### Time-bounded relationships

Operators, owners, subsidiaries, parents, brands, certifying bodies, and known users attach through
time-bounded Facility Relationships. Evidence never propagates automatically through the graph.

Examples:

- A parent-company lawsuit is not automatically a Facility Signal.
- A citation under a former operator remains Facility history but is not evidence against the incoming
  operator.
- An organization-wide dispute is not automatically attributable to all its Facilities.
- Parent chains expand research recall but never create inherited guilt or risk.

### Prospect usage

The Prospect–Facility Relationship is separately evidenced and time-bounded. Acceptable evidence may
include prospect-provided ship-from data, labels or tracking records, official prospect materials, an
explicit 3PL case study, attributable statements, or multiple independent public sources. Anonymous
chatter and single-source inference are leads only.

## 4. Entity resolution and human confirmation

Automated matching may propose a **Facility Match Candidate**, but a human must confirm every match
used externally. Confidence assists review and never publishes a match automatically.

Preserve:

- Raw source identity and address
- Normalized address
- Name similarity
- Address-component agreement
- Parent/operator evidence
- Supporting and contradictory evidence
- Match confidence
- Reviewer and confirmation date

The confirmed-versus-proposed distinction is mandatory for the first ten dossiers and all externally
delivered dossiers.

## 5. Evidence attribution

Every record receives one Facility attribution class:

- `FACILITY_DIRECT` — the record names the Facility address.
- `OPERATOR_DURING_TENURE` — the record concerns the operator and overlaps its verified tenure.
- `ENTITY_ONLY` — the organization is identified but the Facility connection is not demonstrated.
- `AREA_CONTEXT` — the record concerns only the surrounding area.

Only `FACILITY_DIRECT` and carefully qualified `OPERATOR_DURING_TENURE` evidence may support an
external Facility assessment. The other classes remain research leads.

## 6. Source-record provenance

A URL alone is insufficient. Every externally used Facility Source Record preserves:

- Source authority and dataset
- Native record identifier
- Exact source title
- Original entity name and address
- Filing, publication, inspection, event, and retrieval dates
- Direct record URL
- Relevant page, docket entry, section, or citation number
- Short supporting excerpt or structured fields
- Content hash
- Permitted local copy or screenshot
- Access and licensing restrictions
- Later change or disappearance status

Search-result pages are not adequate citations when a native record is available.

## 7. Legal and administrative posture

Every enforcement or litigation assertion carries a procedural posture:

- `ALLEGED`
- `AGENCY_CITED`
- `CONTESTED`
- `ADJUDICATED`
- `SETTLED_NO_ADMISSION`
- `DISMISSED`
- `WITHDRAWN_OR_VACATED`
- `STATUS_UNKNOWN`

An allegation, citation, settlement, and final finding are never interchangeable. The dossier states
what the record says and its current status; it does not convert allegations into events.

## 8. Negative searches

No-result searches are **Bounded Negative Searches**, not proof that a Facility is clean, safe,
compliant, or low risk. Preserve:

- Source searched
- Queries and identity/address variants
- Coverage period if known
- Search date
- Dataset limitations
- Source availability

External wording should state that no responsive record was identified within the named search scope.

## 9. Tier 1 research scope

Every first-ten Facility receives the same minimum review:

1. Normalize and verify the physical address.
2. Establish current operator and tenure as far as evidence permits.
3. Confirm the Prospect–Facility Relationship.
4. Search OSHA using address and known operator variants.
5. Search CourtListener/RECAP using address, current/former operators, and parent candidates.
6. Search relevant Secretary of State registries.
7. Record negative searches, unavailable coverage, and paywalls.
8. Recheck every included record before delivery.
9. Conduct a second-person factual review.

Completion means the scope was attempted and documented—not that adverse evidence was found.

### Corporate records

Secretary of State filings default to identity and context evidence. Entity age, officer churn,
address changes, reinstatements, dissolution, and secured financing are not automatically adverse
Facility Signals. Their operational relevance must be separately evidenced.

### Litigation

A docket hit is not automatically adverse. Establish:

- Party role
- Procedural posture
- Facility attribution
- Operational relevance

Relevant categories may include cargo custody, insurance, operational compliance, shipping controls,
or continuity. Plaintiffs, victims, unrelated payment disputes, employment matters, and procedural
appearances must not be flattened into a lawsuit count.

### OSHA and enforcement

Verify establishment/address, operator tenure, inspection dates/type, cited standard, initial/current
classification and penalty, contest/settlement/deletion/abatement status, and whether the activity
belongs to the warehouse rather than another tenant or contractor.

An OSHA record may motivate a specific operational question but cannot prove cargo theft, insurance
noncompliance, billing errors, or unrelated Facility risk.

### Tier 3 soft signals

Reviews, community chatter, job postings, and snippets are Soft Facility Leads only during the first
experiment. Do not scrape or include them externally. They may lead to authoritative records; two
anonymous claims do not corroborate each other.

## 10. Dossier assessment method

The first ten dossiers contain no composite Facility risk score. Each included Signal instead exposes:

- Attribution strength
- Procedural posture
- Commercial relevance
- Evidence confidence with rationale

Heterogeneous public records are not yet a calibrated predictive model. Scoring may be reconsidered
after 25–30 dossiers and correlation with first-party shipment outcomes.

The normal external signal window is five years. Older records appear only when still operative,
materially connected to current conditions, part of a repeated pattern, or necessary to explain a
current relationship. Historical evidence remains in the Research Brief.

## 11. Two-page dossier structure

### Page one

- Facility identity and verified current operator
- Why the Facility was reviewed
- Two or three strongest confirmed Signals
- Relevant dates, posture, and attribution
- Neutral analyst summary

### Page two

- Source-record timeline
- Questions the evidence raises
- What public records cannot reveal
- Recommended shipment-data tests
- Aurelian audit call to action
- Methodology/limitations and correction channel

Every public Signal should bridge to a legitimate first-party audit question rather than an unsupported
conclusion.

## 12. Sales motion

Use permission-based outreach:

1. Send a short neutral observation.
2. State the record limitation or posture.
3. Ask whether the prospect wants the cited two-pager.
4. Send it only after interest.
5. Transition to what public evidence cannot reveal.
6. Ask for origin-attributed shipment data.

Track:

- Delivery
- Substantive reply
- Dossier request
- Dossier sent
- Discovery call
- Shipment-data conversation
- Data received
- Paid audit or assessment opened

Compare directionally with a similar audit-only cohort or documented recent baseline. Do not claim
statistically proven conversion lift from a ten-prospect sample.

## 13. Experiment design

### Cohort selection

Pre-register ten Facilities before substantive adverse-record research using:

- Ideal-customer fit
- Confirmed Prospect–Facility Relationship
- Operational importance or shipment volume if known
- Reachable decision-maker
- Plausible audit value
- Minimum source availability

Known-adverse Facilities may be labeled positive controls but do not count toward the cohort evidence
rate.

### Two-stage validation

**Evidence test:** at least two of ten Facilities produce a confirmed, relevant Signal that can be
mentioned responsibly.

**Commercial test:** across the ten dossier-assisted prospects, obtain at least:

- Three positive dossier requests or substantive replies
- One shipment-data audit conversation

Interpretation:

- Evidence passes, commercial fails: revise positioning; do not build an engine.
- Evidence fails, commercial passes: test clean/operational-gap positioning manually.
- Both pass: continue manually to roughly 25–30 dossiers.
- Both fail: stop Facility Intelligence work and use the audit offer directly.

Failure kills engine-building, not all future manual experiments.

### Time and freshness

Cap each ordinary dossier at three analyst hours. Unresolved evidence is excluded rather than allowed
to expand into Tier 2/3 research. Capture retrieval dates, native IDs, statuses, and hashes, but refresh
manually immediately before delivery. Scheduled monitoring and generalized change detection wait for
commercial validation and begin only for active opportunities.

## 14. Legal, privacy, and correction safeguards

- Qualified counsel reviews the methodology, template, disclaimer, retention practice, and standard
  outreach before first external use.
- Criminal, fraud, cargo-theft, identity-uncertain, sealed, withdrawn, or materially harmful claims
  receive case-specific escalation.
- Disclaimers do not cure misleading body text.
- Private delivery includes a correction channel but no universal prepublication right of response.
- Material disputes suspend reuse while source, identity, and posture are rechecked.
- Corrections are versioned; prior history is not silently overwritten.
- Public availability does not justify republication of personal data.
- Omit home addresses, personal contact details, birth dates, signatures, family data, and unnecessary
  individual names.

A public registry would require a stronger formal response and dispute workflow before launch.

## 15. Current-system fit

The first ten remain outside the production application in a structured Facility Intelligence
Validation Pack:

- Identity sheet
- Relationship timeline
- Match review log
- Source register
- Negative-search log
- Signal worksheet
- Research Brief
- External Dossier
- Audit Opportunity Note
- Outreach/conversion tracker

Do not add migrations, routes, scheduled jobs, or scorecard fields during validation.

After validation, data separates into:

### Shared Facility Intelligence

- Public Facility identity/address history
- Public operator relationships
- Public Source Records
- Confirmed public Signals
- Dossier versions and changes

### Confidential Facility Relationships

- Which client/prospect uses a Facility
- Client-supplied ship-from evidence
- Shipments and volumes
- Audit findings
- Warehouse Scorecards
- Outreach and sales notes
- Client-specific Gateway recommendations

Confidential relationships are tenant-scoped and RLS-protected. One client must never learn that
another uses the same Facility.

Public Facility Signals remain separate from observed first-party compliance and data confidence.
They cannot alter a Warehouse Scorecard percentage or directly activate Gateway actions. They may
prompt staff review and a governed rule suggestion that follows existing extraction, correctness,
attestation, and activation gates.

## 16. Agent program architecture

### First agent

Build one Facility Research Copilot first. It may:

- Generate approved source queries
- Invoke allowlisted source adapters
- Normalize source metadata
- Propose identity matches
- Propose attribution and procedural posture
- Draft bounded negative searches
- Assemble Research Brief and Dossier drafts

It cannot confirm matches, publish, send messages, directly write governed production records, or
change code/deployment.

### Runtime boundary

- One ADK application under `agents/` in the existing repository
- Independently deployed from Next.js
- One Root Copilot plus deterministic typed tools initially
- No sub-agents until evaluations demonstrate a genuine separate role
- Later copilots may share the deployment while retaining distinct permissions
- Split deployments only for materially different security, scale, dependencies, failure, or release
  requirements

### Control and data plane

```text
Staff / scheduler
→ Next.js control plane
→ separate agent_jobs lifecycle
→ private ADK Agent Service
→ narrow authenticated Next.js tools
→ candidate artifacts
→ human review
→ deterministic acceptance command
→ Neon system of record
```

Agents have no direct Neon access. Next.js owns identity, authorization, tenant scope, validation,
idempotency, and persistence.

Agent work is asynchronous and resumable:

```text
queued → running → awaiting_review → revision_requested → running
       → approved | rejected → completed
```

Do not extend deterministic `audit_jobs`; use a separate `agent_jobs` lifecycle after validation,
while reusing the proven Postgres claim mechanism where appropriate.

### Authentication and capabilities

- Private service-to-service authentication
- Dedicated Agent Service Identity
- Job and correlation IDs
- Workflow version and expiry
- Per-copilot server-enforced Capability Manifest
- No authority from prompts, user cookies, `INGEST_SECRET`, or client API keys
- Unauthorized tools are absent and rejected server-side

### Source access

Use read-only Authoritative Source Adapters with domain allowlists, typed results, provenance, rate
limits, request/time/size limits, and terms/robots review. General web search produces leads only.

All webpages, filings, documents, emails, and uploads are untrusted evidence. They cannot modify
instructions, permissions, tools, identity, or execution policy. Prompt-injection resistance is a
tested requirement.

### State and observability

ADK sessions are temporary. Durable state consists of typed Agent Checkpoints, Agent Artifacts,
Corrections, reviews, and an Agent Run Ledger.

The ledger records:

- Job/run/attempt/correlation identities
- Copilot, workflow, and model versions
- Tool timing/outcome/idempotency
- Input/output artifact IDs and hashes
- Tokens, cost, and latency
- Validation and review results
- Retry/failure classifications
- Final disposition

Store prompt-template IDs and input references/hashes by default. Full prompts and responses are
restricted diagnostic material with redaction and retention limits, never ordinary logs or Sentry
payloads.

## 17. Engineering-agent governance

Separate two authority planes:

### Engineering Agents

Codex, Claude Code, GitHub Copilot, or another authorized coding assistant may inspect, edit, test,
and review the repository under an explicit engineering task.

### Operational Agents

ADK copilots perform assigned business work through Capability Manifests and cannot modify source,
deploy, repair themselves, or grant themselves tools. They submit engineering issues instead.

Material engineering changes are defined by consequence rather than diff size. They include changes
to behavior, calculations, auth, tenancy/RLS, schema/migrations, financial writes, deterministic
decisions, agent authority, integrations, secrets, queues, dependencies, infrastructure, or
confidential data.

Every material change requires:

- An approved specification
- A fresh-context Independent Engineering Review
- Deterministic tests/build and relevant integration verification
- A founder-readable release summary plus technical evidence
- Explicit founder production approval

Provider diversity between implementer and reviewer is optional; fresh context is required.

## 18. Founder learning mission

The learning mission is now to operate Aurelian safely as an AI-assisted technical founder, not to
become a full-time programmer. Lessons should use real repository work to teach:

- Behavioral specification
- Architectural fit
- Invariants and boundaries
- Test evidence
- Tenant and financial risk
- Failure handling
- Rollback and release decisions

Syntax memorization is secondary.

## 19. Agent learning and reinforcement learning posture

Agents improve through an employee-like managed loop:

```text
SOPs → supervised work → structured corrections → approved examples
→ evaluation cases → offline candidate improvement → held-out evaluation
→ human promotion
```

Every rejection or material edit preserves:

- Original proposal
- Accepted result
- Controlled correction reason
- Optional reviewer note
- Learning permission scope

Initial Facility correction reasons include wrong Facility/spatial scope/operator, unproven tenure or
prospect relationship, entity-only evidence, weak provenance, wrong posture/party role, unsupported
commercial relevance, overstated assertion, incomplete citation, duplicate evidence, unnecessary
personal data, stale status, and prompt injection.

### Promotion order

Truth and safety gates are non-tradeable:

- No unsupported external claim regression
- No published unconfirmed matches
- Citation and posture accuracy
- Tenant isolation
- Authorized tools only
- Prompt-injection resistance
- Personal-data compliance
- Human approval boundaries

Only after hard gates pass may a candidate optimize acceptance, analyst time, edit distance, calls,
latency, token cost, or completion rate. Sales conversion is tracked separately and cannot reward
sensational evidence.

The first-ten Copilot remains a **Trainee** with 100% review of matches, records, attribution, posture,
Signals, factual sentences, and delivery.

### Learning permissions

Every example is classified:

- `PUBLIC_SHARED`
- `AURELIAN_INTERNAL`
- `TENANT_RESTRICTED`
- `TRAINING_PROHIBITED`

Tenant-confidential data is excluded by default from cross-client retrieval, examples, evaluations,
tuning, and reinforcement learning. De-identification alone does not expand permission.

Examples support revocation lineage. If a source or correction is withdrawn or proven wrong, stop
retrieving it, rebuild affected datasets, identify influenced agent versions and Dossiers, and trigger
correction review without deleting history.

### Reinforcement learning

True model-weight RL is deferred until Aurelian has stable tasks, large governed datasets, reliable
rewards, held-out evaluations, rollback, and evidence that retrieval, tools, prompts, and workflow
optimization have plateaued. Production agents never self-modify or learn online from raw outcomes.

## 20. Model posture

No permanent model decision is part of ADR 0017. Models remain replaceable and must earn a role through
Aurelian-specific evaluations. The working cost hypothesis discussed was:

- A low-cost model for routine structured agent work
- A stronger model only on deterministic ambiguity/failure tripwires
- Very inexpensive batch models for bulk structured classification
- Deterministic code for authoritative audit, policy, and Gateway decisions

Provider pricing and model availability must be reverified at implementation time. Optimize total
accepted-work cost and analyst minutes, not token price alone.

## 21. Recommended execution sequence

### Phase 0 — manual validation

1. Pre-register ten Facilities and a comparable audit-only baseline.
2. Create the Validation Pack templates.
3. Obtain one-time counsel review of external artifacts and language.
4. Complete Tier 1 research manually within the three-hour cap.
5. Send permission-based outreach and track the full conversion ladder.
6. Apply the evidence and commercial kill tests.

### Phase 1 — local Copilot prototype, only after the manual workflow is understood

1. Inventory and repair the existing shared LLM boundary.
2. Scaffold one local ADK application under `agents/`.
3. Implement one Root Copilot and mocked/read-only tools.
4. Define typed Source Record, Match Candidate, Signal Candidate, Correction, Checkpoint, and Artifact
   contracts.
5. Create adversarial evaluation cases.
6. Run happy-path and edge-case local tests.
7. Keep all outputs outside governed production records.

### Phase 2 — controlled integration, only if the dossier motion validates

1. Design migrations through the repository migration registry.
2. Add separate Agent Job and artifact/review/ledger storage.
3. Add private Next.js agent-tool endpoints and Capability Manifest enforcement.
4. Add authoritative source adapters one by one.
5. Add staff review UI.
6. Run the Copilot in Trainee Review.
7. Deploy the private Agent Service only after eval gates pass.

### Phase 3 — learning flywheel

1. Capture structured corrections and permitted-use scope.
2. Promote approved examples into retrieval.
3. Turn recurring failures into permanent evaluations.
4. Compare candidate instructions and workflows offline.
5. Promote only versions that pass hard gates and improve held-out results.

### Phase 4 — additional copilots

Add Policy Intake, Ingestion Exception, Dispute, Compliance Analyst, and Sales Research copilots one at
a time. Each requires a separate Capability Manifest, artifact contract, evaluations, and human gates.
Do not build a master coordinator until independent copilots create demonstrated coordination pain.

## 22. Open items

The session had not yet resolved these points when this summary was requested:

- Exact pre-production Facility Research Copilot evaluation dataset size and acceptance thresholds
- Final model selection after Aurelian-specific evaluations
- Specific Cloud deployment target and service-auth implementation
- Detailed schema and API contracts, intentionally deferred until manual/commercial validation
- Exact trust-level promotion thresholds beyond Trainee Review
- Whether and when a public searchable Facility registry receives a formal operator response process
