# Policy Intelligence — Analyst Decision Support (operating model for a domain-novice analyst)

> **STATUS: IMPLEMENTED (2026-06-26).** Governance model shipped: DG1 attestation flow
> (`draft → client_attested → active`), DG2 scope statement, DG3 guarantee language,
> DG4 enforcement reach documented. `AttestationPanel`, `ScopeStatement`, and
> `GuaranteeCard` components in `components/console/policy-intelligence.tsx`.
> `attestRulesetAction` + `activateRulesetAction` in `app/(console)/policies/actions.ts`.
> Implementation details in `../CHANGELOG.md`; remaining open work in `../BACKLOG.md`.

## What this is

The whole Policy Intelligence safety model is **suggest-only + human-confirm** (invariants
4/10): the AI proposes, a human analyst confirms. That model is only as safe as the
analyst. This doc addresses the case the architecture quietly assumed away: **the analyst
is the sole founder, with no insurance/contracts/policy background.** It defines how such
an analyst can operate the system safely, and what the system must add to support them.

## The core reframe

The risk a novice analyst introduces is not architectural — it relocates risk from the
**system** to the **reviewer** (a novice may rubber-stamp a wrong AI suggestion). Two
reframes make it tractable:

1. **Transcription vs. judgment.** The grounding discipline (`02-extraction.md`: a rule's
   `clause_ref` must exist in the document `raw_text`) means most confirmations are
   *verification against a citation*, not domain expertise:
   - **Transcription** ("the AI says signature >$1,000; the contract says signature
     >$1,000") — a reading-and-matching task. A novice **can** do this safely; the citation
     is the answer key.
   - **Judgment** ("*should* there be a signature rule here?", "is this threshold right?",
     "is this gap material?", "is this finding preventable?") — no answer key. A novice
     **cannot** do this safely; a wrong call here is what voids an insurance claim.
2. **You are not the underwriter.** The authority on what the rules *should be* is the
   **client's signed contracts and their insurer**, not the founder. Aurelian structures
   and enforces rules that **already exist** in documents the client agreed to. Required
   expertise drops from "be an insurance expert" to "faithfully transcribe a contract with
   AI help, and know when to escalate."

## What exists today

- **Suggest + confidence + reasoning** pattern: `lib/ingestion/data-clerk.ts`
  (`{standardCode, confidence, reasoning}`, pre-fills the form, never auto-commits). The
  planned extractor mirrors it with `confidence` + lineage (`clause_ref`, `document_id`).
- **Recommendation surfaces:** `reports.ts` `getTopGatewayRuleSuggestions()`,
  `05-readiness.md` "recommended gateway controls / suggested rollout mode".
- **Backtest** as evidence (`04-backtest.md`) — a rule's effect can be measured against
  12–24 months of history rather than guessed.

## What's missing for a novice (the gap)

The suggest+verify loop exists; the **novice-trust** layer does not:
- (a) a **starter rule library** that encodes expert knowledge once (per vertical);
- (b) **confidence/grounding-gated escalation** that routes *judgment* cases away from a
  solo rubber stamp;
- (c) an **expert backstop** for the cases neither the AI nor the founder should decide.

## Decisions

### D1 — Posture: **advisory delivery, but with borrowed/encoded authority — never founder-as-self-taught-authority** — LOCKED
Founder chose the **advisory** route (we tell clients what their rules *should* be), not
pure operator. This is the higher-value but higher-liability path. It is viable on day one
**only** if "advisory" means the *expertise* is in the loop, not that the *founder* is the
expert.

- **"Just study" is a supporting activity, never the foundation.** Self-taught knowledge as
  the basis for insurance advisory fails on (1) **liability** — advising an approach that
  later voids a claim is E&O exposure on the founder; (2) **credibility** — a client's risk
  manager/broker out-experts a self-taught founder immediately; (3) **time** — advisory-grade
  depth takes years + real claims experience. Study to be **conversant** (vocabulary, ask
  good questions, verify an expert's work, transcribe accurately), not to *be the authority*.
- **Carry E&O / professional-liability insurance and contractual disclaimers** the moment
  advisory is sold — operator posture has far less exposure than advisor; advisory raises
  the stakes on real authority being present.
- **Day-one authority comes from borrow/buy/encode, not study** (resolved in D2/Q3): borrow
  the client's insurer/broker; buy a fractional expert; encode a one-time expert-built
  starter rule library the *software* then delivers at scale; learn from design-partner
  clients 1–5.
- **Founder's job stays verification + operation**: confirm the AI/expert correctly captured
  the source, run the system, route judgment calls to the real authority (D-Q2).

### D2 — Cold-start sourcing: **lead with the encoded starter library (c); broker (a) is parallel cold outreach** — LOCKED
Founder is cold — no broker/insurer relationships. Key domain fact that unblocks this:
**the "general rules" already exist as the taxonomy's insurance risk categories**
(`03-taxonomy.md` / `lib/intelligence/taxonomy.ts`: `MISSING_SIGNATURE_REQUIRED`,
`INVALID_CARRIER_SERVICE`, `THIRD_PARTY_INSURANCE_REQUIRED`, `POLICY_LIMIT_EXCEEDED`,
`PACKAGING_NON_COMPLIANT`, `DOCUMENTATION_MISSING`, `APPRAISAL_REQUIRED`,
`CLAIM_WINDOW_RISK`, ~20 total).

**General vs specific — the load-bearing distinction:**
- **Categories are general** (and already built) — the *vocabulary of risks*. The denial
  patterns are: signature, approved carrier/service, declared value / third-party insurance,
  per-parcel value cap, packaging standards, documentation/appraisal/serial, claim-filing
  window. (Founder's "2-day vs 3-day" example is not a real denial pattern; faster ≠ more
  risk. The real triggers are the categories above.)
- **Thresholds + applicability are policy-specific** ("$1,000 vs $2,500 signature", approved
  carriers, value caps) — read from each client's actual policy, **never guessed.** Guessing
  one wrong is the denied claim. (Maps to transcription-vs-judgment in D1.)

**Cold-start path (no broker required to start):**
1. **(c) first — encode a jewelry compliance starter library** from the 20 existing taxonomy
   categories + **public** sources (insurer underwriting guidelines, Jewelers Mutual / JSA
   shipping guidance, carrier high-value rules). Categories + *typical* control structures,
   not invented thresholds.
2. **One paid expert review pass** (freight-insurance consultant / underwriter hours, low
   cost) — converts a founder's checklist into an *expert-vetted* library and is the fastest
   education. The one real spend.
3. **(a) broker partnership = parallel cold outreach**, where the vetted library is the asset
   that makes the pitch credible.

**Day-one advisory value (honest, achievable):** "here are the standard jewelry shipping
controls; let's read *your* policy to set *your* thresholds, then backtest 12 months to show
where shipments violated them." The advisory is the **gap** between standard controls and the
client's actual practice — found via policy transcription + deterministic backtest, not
underwriting genius. **Caveat:** client-specific thresholds come from the policy or the
expert, never fabricated and advised as authoritative (the liability line).

### D3 — Decision routing: **three-lane confidence × grounding gate; narrow green to start** — LOCKED
The recommendation path = the system sorting each proposed rule into a lane, so a novice
analyst knows *which decisions are safe to make alone* rather than relying on willpower.
Two signals (both already available/cheap): **grounding** (does `clause_ref` exist in the
client's `raw_text`? — extractor computes it) and **confidence** (AI self-report, as
`data-clerk.ts` already returns).

| Lane | Condition | Analyst action |
|------|-----------|----------------|
| 🟢 Green — transcription | grounded in a client clause AND high confidence | confirm solo: open the cited page, check the AI copied it right (a non-expert can) |
| 🟡 Yellow — verify | grounded but low confidence, or a threshold to read off | read the clause carefully; confirm only if it plainly matches; ambiguous → red |
| 🔴 Red — judgment | not grounded in any client doc (AI-inferred "best practice"), threshold the policy is silent on, materiality/rollout calls | **do not confirm alone** — escalate to the vetted starter library, the paid expert, or the client/insurer |

- Encodes transcription-vs-judgment (D1) as **software, not willpower**; red = the
  underwriting decisions the founder won't make solo.
- The **red queue concentrates the expert/library spend** on the handful of rules that need
  it — affordable, and where liability actually lives.
- It **teaches**: every green/yellow confirmation with the clause in view is a grounded rep;
  study becomes anchored in real documents.
- It is an **honest client artifact**: "N rules confirmed against your contract; M need your
  insurer's input."
- **Green starts narrow** (over-verify nearly everything while learning); widen as the
  confirmed-rule track record grows and the backtest validates the founder's calls — never
  trust a wide green lane early.

### D4 — Backtest-as-evidence + clients-1–5 as design partners — LOCKED
- **No rule is "trusted" until backtested** against 12–24 months of that client's shipments
  (`04-backtest.md`). The novice superpower: don't *judge* whether a rule is right — *measure*
  what it would have flagged. Fires on 80% of shipments → mis-specified threshold; never fires
  → miscaptured. Caught before a client sees it; deterministic, so it's evidence not opinion.
- **Denied-claims history is the ground-truth answer key** (`01-ingestion.md`). Reverse-engineer
  starter rules from real denials ("USPS on a $4k item → denied" is a confirmed rule). Ask every
  prospect for denial history — highest-value training data and most persuasive sales artifact.
- **Backtest closes the green-lane loop (D3):** widen green when backtests confirm prior
  confirmations held, not by feeling more confident.
- **Authority for clients 1–5 is a borrowed stack, not the founder:** (1) the client's policy
  document, (2) their denied-claims history, (3) one paid expert review on red-lane items,
  (4) the client's own risk/ops person. The founder *operates* the loop that produces the
  expertise (`05-readiness.md`: first 3–5 clients are the training dataset).
- **Price clients 1–5 as design partners** (reduced/free for data + denials + feedback +
  testimonial + risk-person time), framed "we're building your compliance model together" —
  lowers the liability bar and earns the testimonials that make client 6 a real advisory sale.

## Positioning revision (2026-06-26): Governance, not Advisory

Founder sharpened the posture from "advisory with borrowed authority" (D1) to **pure
Governance / Enforcer**: "I do not recommend or underwrite; I digitize the text of *your*
contract into an enforceable schema and enforce it." This is a strict improvement — more
defensible, and it leans on the founder's *real* domain authority (warehouse ops, how 3PLs
cut corners, high-value jewelry freight) rather than insurance law. It refines, not
replaces, D1–D4 (transcription-vs-judgment, three-lane routing, backtest-as-evidence all
still hold and support governance). But it has three holes being grilled:

- **Hole 1 — no ratification loop.** "I'm just the translator" requires the *authority*
  (client, ideally broker/insurer) to confirm the digitization matches the policy. The
  current MVP is **staff-only, clients read-only on policy** (`01-ingestion.md`: "clients
  never author … portal stays read-only on policy"; activation is a staff transition). So
  today the founder *unilaterally interprets* and calls it translation — the E&O dodged at
  the front door returns. Governance is liability-clean only with an authority sign-off that
  does not yet exist and is currently forbidden by the MVP.
- **Hole 2 — ambiguity = interpretation.** Governance is clean only for unambiguous,
  quantitative clauses. "Commercially reasonable packaging" / "appropriately secured" can't
  be digitized without interpreting = the advisory act that creates liability. → the D3
  red lane; do not digitize ambiguous clauses unilaterally.
- **Hole 3 — over-guarantee.** "Your WMS cannot generate a label that violates your policy"
  recreates liability: (a) contradicts the precheck-not-proxy / shadow gateway design
  (`08-gateway.md` D1/D2 — we don't physically prevent the label), and (b) guarantees
  *completeness* (every clause captured). Defensible guarantee: "enforces the controls you
  confirmed, exactly as confirmed."

### Governance decisions

- **DG1 — Ratification loop: LOCKED — recorded authority attestation; `draft → client_attested → active`.**
  Governance is liability-clean only if the *authority* confirms the digitization. Add an
  explicit attestation state between draft and active: the client (and, where present, their
  broker/insurer) reviews the digitized ruleset **next to the source clauses** (lineage:
  `clause_ref` + stored doc) and attests "this accurately reflects our policy."
  - **First-class state transition**, not a staff click — this transfers interpretive
    authority back to the client. **Deliberately modifies the current client-read-only-on-policy
    MVP** (`01-ingestion.md`): clients still cannot *author* rules — they may only *confirm or
    reject* the founder's digitization of their *own* document. Preserves the suggest-only /
    staff-authored boundary while closing the liability hole.
  - **Attestation is stored, timestamped evidence** ("client confirmed 2026-07-01 that ruleset
    v3 reflects their Cabrella policy") — the single best E&O defense: you enforce what the
    authority *ratified*, not what you *guessed*. Governance analogue of the gateway forensic log.
  - **Clause-level for ambiguous rules** (DG2 red lane): crisp clauses ratified in bulk;
    ambiguous/inferred ones get individual sign-off or are excluded — never silently digitized.
  - **Broker/insurer is the stronger attestor** when available (the gold-standard shield); the
    client is the minimum viable attestor for day one.
  - **Truthful pitch:** not "I digitized your contract" (interpretation) but "I digitized your
    contract and *you confirmed it's right* — now I enforce what you confirmed."
- **DG2 — Scope boundary: LOCKED — govern only deterministically-checkable operational controls.**
  - **In scope:** declared-value thresholds, signature requirements, approved/excluded
    carriers + services, per-parcel value caps, routing/lane restrictions, discrete packaging
    + documentation requirements — i.e. exactly the `PolicyCondition` keys
    (`policy-evaluator.ts`). **Scope = whatever the evaluator can deterministically check.**
  - **Out of scope #1 — ambiguous terms** ("commercially reasonable packaging", "appropriately
    secured"): require interpretation → **red lane**. Either the client/broker attests to a
    *specific* digitization (making them the interpreter), or it is not enforced and that is
    stated explicitly. Never silently digitized.
  - **Out of scope #2 — non-operational clauses** (premium, notice, subrogation, deductibles,
    cancellation): not shipment-time checks; governance never touches them. The gateway is not
    a substitute for the client reading their whole policy.
  - **Written scope statement per client:** "we enforce these N operational controls; we do NOT
    enforce these M (ambiguous/non-operational)." This is the liability firewall and the
    precondition for DG3's honest guarantee.
  - **Unmapped operational clauses → taxonomy-discovery candidates** (`07-schema-evolution.md`),
    not silently dropped.
- **DG3 — Guarantee language: LOCKED — guarantee the mechanism, never the outcome.**
  - ❌ "your shipments will be insured/covered" (underwriting). ❌ "your WMS cannot generate a
    label that violates your policy" (completeness guarantee + physical-prevention claim the
    precheck/shadow gateway can't back).
  - ✅ Contract phrasing: **"We guarantee that the operational controls you have confirmed are
    enforced by the Gateway exactly as confirmed, and that every shipment decision is logged.
    We do not guarantee insurance coverage."**
  - Four load-bearing qualifiers: **ratified** (DG1), **in scope** (DG2), **"flags — and in
    enforce mode, blocks"** (shadow-first reality, `08-gateway.md` D2 — don't promise blocking
    not yet on), **logs every decision** (the forensic record is the deliverable).
  - **Explicit, unburied disclaimer:** "The Gateway enforces operational shipping controls; it
    is not insurance, not insurance advice, and does not guarantee claim coverage. Coverage
    determinations rest with your insurer." The sentence the E&O carrier wants; consistent with
    governance (an enforcer guarantees the rules ran, not the outcome).
- **DG4 — Enforcement reach: LOCKED — three-legged stool; the *brand* enforces, software is the mechanism.**
  The 3PL is a separate company, not the customer, and a precheck it can skip is advisory.
  Enforcement = three legs:
  1. **Technical:** the 3PL's WMS calls `/v1/precheck` before label purchase (necessary, not
     sufficient).
  2. **Commercial (the real enforcer):** the **brand's contract with its 3PL** mandates routing
     through the Gateway and no-ship-on-BLOCK. Aurelian *supplies the brand the SLA clause* —
     arming the brand to govern its own vendor. This leg is not Aurelian's authority; it is the
     brand's.
  3. **Technical-enforcement:** the **signed approval token** (`08-gateway.md` D1) — where
     Aurelian controls the label step (platform hook / own issuance), no valid token → no label.
     The upgrade path from advisory precheck to actual gate.
  - **Positioning:** the *brand* is the enforcer; Aurelian's software is the mechanism and the
    forensic log is the proof (per-warehouse SOP-drift scoring, `05-readiness.md`). Do **not**
    claim "my software physically stops any 3PL anywhere" — the architecture can't.
  - **Sell first to brands that actually control their 3PL relationship** tightly enough to
    mandate routing. This is the founder's warehouse-ops authority monetized: knowing how 3PLs
    cut corners → which controls to gate and what the SLA clause must say.
- **DG5 — Expert's residual role: LOCKED — near-zero on authoring, retained for completeness + red-lane + E&O.**
  Governance removes the need for an expert to *write/vet invented rules* (the big advisory
  cost) — the client's document is authority and the client attests (DG1). Residual, non-zero:
  1. **Completeness check (the dangerous one):** a non-expert may faithfully capture clauses
     1–11 and miss that 12.3 was load-bearing. Transcription accuracy ≠ protection against
     *omission*; you can't ratify what you didn't extract. One-time "did you miss anything
     material?" pass on the first few clients.
  2. **Ambiguous-clause adjudication (DG2 red lane):** turning "appropriately secured" into a
     number is decided by the client/broker/expert — never the founder alone.
  3. **One-time E&O posture + contract/guarantee/SLA language review** (DG3/DG4).
  - **Sourcing:** the **broker (DG4 channel) is the natural completeness-checker and red-lane
    adjudicator** — free, already knows what a jewelry policy must contain (another reason to
    chase the partnership). Fractional expert only if no broker, front-loaded to clients 1–3.
    One-time legal review before selling.
  - The pasted "no expert needed" is right about *authoring*, wrong about *completeness* —
    missing a material clause is the one failure that turns the governance guarantee into a
    liability.

## Governance model — summary

```text
AUTHORITY        the client's policy/contract PDF (+ broker/insurer)  — never the founder
TRANSLATION      founder digitizes unambiguous operational clauses (DG2) into PolicyCondition
RATIFICATION     client (ideally broker) attests the digitization matches (DG1) → active
ENFORCEMENT      brand's 3PL-SLA clause + precheck + approval token (DG4) — brand enforces
GUARANTEE        "we enforce the controls you confirmed, and log every decision" (DG3)
                 — never "you're covered"
EXPERT           completeness check + red-lane ambiguity + one-time E&O (DG5) — often the broker
```

The founder is the **systems-governance operator**: digitizes the authority's document,
gets it ratified, enforces it via the brand's own contractual leverage, and proves it with
the forensic log. Authority is always borrowed/ratified, never invented. Liability stays
with the insurer (coverage) and the client (their policy), not the founder.

## Readiness assessment & paid packaging (2026-06-26)

Founder wants to charge for **Implementation, Translation, and Proof** (a ~$2,500 onboarding).
The pricing *principle* is correct B2B ("sell the Lock, not the Idea" — charge for
implementation/translation/proof, not advice). The constraint is **build state**, verified
against code.

**What's built (runnable):** deterministic evaluator (`evaluatePolicyContext`); rule editor
UI (`app/(console)/policies/[policyId]/rules`) = the Translation surface; policy/doc/ruleset
CRUD; `runPolicyBacktest` + `getGatewayAssessment` = the Ghost Audit runner.

**What blocks charging (gaps, unequal cost):**
- **Proof / Ghost Audit is numerically untrustworthy — the #1 blocker.** `loadBacktestContexts`
  (`policy-service.ts:510`) is the **legacy buggy version** (ADR 0001 / `04-backtest.md`):
  `LIMIT 5000` silent truncation (`:523`,`:540`); **per-source contexts not the shipment
  spine** (`:544`) → axis-crossing governance rules (vertical+value+carrier) **silently fail
  to match** → under-reports violations (the dangerous direction); `invoice[0]` mis-attribution
  (`:561`); no effective-dating / dedup / tri-valued unknowns. **Charging for a wrong "$84k
  exposure" number is the cardinal sin for a compliance brand.** Cheapest to fix (data/logic,
  no new service); it is the wedge → **fix first.**
- **Live Gateway unbuilt** (`08-gateway.md` PLANNING — no `/v1/precheck`, API keys, WMS adapter).
  "Integration / The Plumbing" has nothing to integrate yet → not sellable as day-one work.
- **Attestation (DG1) planning-only** → Translation today is unratified interpretation (the
  liability hole). Must be in the paid product.

**Packaging — sequence sale to deliverable, mapped to Audit→Diagnosis→Cure:**
- **Phase 1 — paid Compliance Risk Assessment (Translation + Ghost Audit = Diagnosis).**
  Sellable after the backtest fix. Needs: manual translation (exists) + **corrected backtest**
  + DG2 scope statement + DG1 attestation. **No live Gateway required.** First invoice; the
  Ghost Audit sells the Gateway.
- **Phase 2 — live Gateway (Integration = Cure).** After Phase 1 proves value and the Fastify
  service is built. Recurring + integration fee. **Do not invoice integration of an unbuilt
  service.**

### Packaging decisions

- **DP1 — Backtest-fix is the gate to any paid Proof: LOCKED.** The Ghost Audit is the wedge,
  the proof, and the fee justification — and it is currently wrong in the *under-reporting*
  direction (axis-crossing rules silently don't fire). **No paid Compliance Risk Assessment is
  sold until the backtest is correct and validated** (re-run yields stable, complete, deduped
  numbers; an axis-crossing jewelry rule actually fires on seed data). It is the **#1 build in
  the company** — cheapest high-leverage fix (one function, items already scoped in BACKLOG
  "Backtest Correctness (ADR 0001)"), and the only thing that makes a non-expert founder's
  number defensible. Under-reporting is worse than over-reporting for a compliance product:
  certifying a client "safe" when they are exposed is the version that gets you sued.
- **DP2 — Phase the offering: LOCKED.** **Phase 1 = fixed-fee Compliance Risk Assessment**
  (deliverable after DP1): Translation (manual rule editor) + DG1 attestation + DG2 scope
  statement + corrected Ghost Audit over 30–90 days → the Diagnosis half of the Compliance
  Intelligence Package (a *report*, not a running gate). Standalone value even if they never
  buy the Gateway. **Phase 2 = the live Gateway** (Integration / `/v1/precheck` + API keys +
  WMS adapter + shadow→enforce), sold separately after it is built — recurring + integration
  fee. **The invoice explicitly scopes Phase 1 as an assessment, not a running enforcement
  service** (liability hygiene: it tells them their exposure, it does not yet prevent it). The
  corrected Phase-1 number is the primary Phase-2 sales tool; this also de-risks the build —
  validate demand + get revenue before sinking weeks into the Fastify Gateway.
- **DP3 — Attestation inside the paid Translation: LOCKED.** Client sign-off is a **mandatory,
  client-facing line item** of the paid Assessment, framed as a **premium deliverable** ("your
  digitized rulebook, verified clause-by-clause against your policy, with your sign-off on
  record" — a ratified asset they can show their insurer), not a liability chore. The
  clause-by-clause walkthrough (lineage: `clause_ref` + stored doc) *is* the high-trust
  executive-alignment moment that earns the fee, and it gates Phase 2 (the Gateway only
  guarantees enforcement of *ratified* rules — DG1/DG3). **First clients: attestation is
  manual** (signed PDF/email "we confirm ruleset v1 matches our policy as of [date]"); build
  the `draft→client_attested→active` in-app flow after a couple of sales. Don't block the first
  sale on the UI; do block it on getting the signature.
- **DP4 — Invoice structure: LOCKED — smaller paid Assessment, deposit-to-start, credited to Phase 2.**
  Neither "$2,500 upfront sight-unseen" (brutal cold ask for an unknown brand) nor "free Ghost
  Audit" (devalues the best proof; can't run until DP1). Instead: **paid Compliance Risk
  Assessment ~$1,000** (the $2,500 is the *Phase-2 Gateway onboarding*, not the diagnostic);
  **~50% deposit to start** (forces them to send policy + data + connect ops this week), **50%
  on delivery** of report + ratified rulebook; **fully credited toward the Gateway onboarding**
  if they proceed (paid-pilot-credits-the-contract funnel). Never fully free (compliance: free
  signals nothing, loses executive attention). Raise the number with proof/testimonials. **Hard
  gate: no Assessment invoice until the backtest is fixed (DP1).**
- **DP5 — Data-readiness / honest Ghost Audit: LOCKED — three buckets, sell the unknowns.**
  Ghost Audit reports **Violations** (N, $X), **Compliant** (M), and **Couldn't assess — data
  missing** (Z) — never fold Z into compliant (tri-valued, `04-backtest.md`: "unknown ≠
  compliant"). The Z bucket is itself a finding: "your 3PL didn't capture whether a signature
  was required → you can't *prove* compliance in a dispute" — often bigger and more alarming
  than the violations, and a clean Phase-2 hook (the Gateway *forces* the data to exist).
  Protects the founder (no implied completeness). **Data-readiness check at onboarding**: if
  fields are mostly null, finding #1 is the data capture itself. Required by the DP1 fix anyway.

## Packaging — summary

```text
GATE        fix the backtest first (DP1) — no paid Proof on wrong numbers
PHASE 1     paid Compliance Risk Assessment ~$1k (Translation + attestation + corrected Ghost
            Audit) → Diagnosis report. Deposit to start / balance on delivery; credited to P2.
PHASE 2     live Gateway ~$2.5k onboarding + recurring (Integration = Cure) — after it's built
TRANSLATION manual digitization (rule editor) + clause-by-clause client attestation (premium)
PROOF       3-bucket Ghost Audit: violations / compliant / couldn't-assess (sell the unknowns)
GUARANTEE   mechanism only (DG3); Phase 1 is an assessment, not a running gate
```

Charging is **possible and correct** ("sell the Lock, not the Idea") — but sequenced to build
state: sell the Diagnosis you can deliver correctly, prove the number, then sell the Cure.

## Founder's day-one playbook (clients 1–5)

1. **Target** jewelry brands that ship high value, have felt a denied/underpaid claim (the
   pain is the wedge), and are small enough that the owner decides (no procurement gauntlet).
2. **Pitch evidence, not expertise:** "Send me your insurance policy + 12 months of shipping
   data. I'll show you exactly which shipments violated your policy's coverage terms — the ones
   that would be denied if lost — and how much value was exposed. Then my gateway stops it."
3. **Deliver the Compliance Intelligence Package** (`05-readiness.md`): Recovery (audit) + Risk
   (backtest of their shipments vs *their own* policy) + Cure (gateway). Authority = their
   documents, not the founder's opinion.
4. **One freight-insurance consultant on call** (a few hours/month) for red-lane judgment
   items — the authority backstop and E&O sanity check.
5. **Liability hygiene:** design-partner agreements stating software-driven gap analysis from
   the client's documents, *not* underwriting/legal advice; carry E&O once charging for advice;
   never say "you're covered" — say "your policy requires X; this shipment didn't do X."
6. **Study in parallel, to be conversant:** cargo-insurance basics, jewelry insurers (Jewelers
   Mutual / JSA guidance), carrier liability / declared value, Carmack basics — enough to run
   the expert/client conversations and verify, not to *be* the authority.

## Viability verdict

**The business is possible for a novice — conditionally.** Viable as the **evidence-based
operator with borrowed authority** (this whole doc). **Not** viable as the self-taught oracle
who underwrites from the gut (liability, credibility, wrong calls). The advisory sold is *not*
"let me design your insurance program" (needs absent expertise); it is "let me show you, with
evidence from your own policy and denied claims, where you're losing coverage — and enforce the
fix." The founder becomes a genuine expert as a **byproduct** of running the loop. Real risks
to watch (not novice-ness): clients lacking clean policy/shipping data, the denied-claims wedge
being hard to source, slow trust-based sales cycles, and the temptation to over-promise advisory
the evidence can't back.

## Related docs

- `02-extraction.md` — suggest-only boundary, confidence, lineage/grounding tripwires.
- `04-backtest.md` — backtest as decision evidence.
- `05-readiness.md` — "analyst confirmation over automation for the first 3–5 clients".
- `../adr/0003-retrieval-and-llm-boundary.md` — AI suggests/narrates, deterministic code
  decides; the analyst confirms.
