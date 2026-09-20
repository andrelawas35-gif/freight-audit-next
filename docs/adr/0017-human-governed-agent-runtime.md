# ADR 0017 — Human-Governed Agent Runtime Beside the Application

- **Status**: ACCEPTED
- **Date**: 2026-07-10
- **Deciders**: Founder (grill-with-docs session)
- **Related**: [ADR 0003](0003-retrieval-and-llm-boundary.md),
  [ADR 0013](0013-rls-enforcement-on-the-client-path.md)

## Context

Aurelian plans to add employee-like operational copilots, beginning with public-record Facility
research and later potentially extending to policy intake, ingestion exceptions, disputes, and
compliance analysis. The existing product is a Next.js/Neon system whose financial engines and
policy evaluator are deterministic, tenant-scoped, and human-governed. Embedding autonomous agents
directly in those authorities, allowing direct database access, or permitting online self-modification
would create a second authorization model and undermine reproducibility, tenant isolation, and review.

## Decision

Aurelian will maintain one initially separate ADK application boundary under `agents/`, beginning
with a single Facility Research Copilot. The Agent Service is invoked through asynchronous,
resumable Agent Jobs and may access production state only through narrow authenticated Next.js tools.
It has no direct Neon access. Next.js retains authorization, tenant scoping, validation, idempotency,
and governed persistence. Agent work uses a separate lifecycle from deterministic `audit_jobs`, though
both may share the proven Postgres claim pattern.

Each copilot receives a server-enforced Capability Manifest. External and client-supplied content is
untrusted evidence and cannot change instructions, identity, tools, or permissions. ADK sessions are
temporary; typed checkpoints, artifacts, corrections, reviews, and run ledgers are the durable record.

Operational Agents produce proposals and reviewable artifacts. They cannot modify source code,
deploy, activate policy rules, publish dossiers, make financial decisions, file or settle disputes,
or send sensitive messages without the relevant human-governed workflow. Engineering Agents such as
Codex, Claude Code, or GitHub Copilot may edit the repository only within explicit engineering tasks;
material changes require fresh-context independent review, deterministic verification, and founder
release approval.

Agent improvement is offline and versioned. Human corrections preserve the original proposal,
accepted result, controlled reason code, and permitted-use scope. Approved examples may feed
retrieval and evaluations. Candidate prompt, tool, workflow, or trained-model changes must pass
non-tradeable truth, citation, identity, security, privacy, prompt-injection, and authority gates on
held-out cases before human promotion. Production agents never self-modify or learn directly from
unreviewed operational or sales outcomes. Tenant-confidential material is excluded from cross-client
learning by default, and learning examples support revocation lineage.

## Consequences

- Deterministic financial and policy authorities remain unchanged; agents assist at the edges.
- One deployable agent boundary minimizes early operational complexity while capability manifests
  prevent copilots from sharing authority merely because they share a runtime.
- Human review, artifact lineage, evaluation data, and correction capture must exist before agent
  autonomy can expand.
- Agent models and hosting providers may change without changing this boundary.
- True reinforcement learning is deferred until stable tasks, sufficient governed examples, reliable
  rewards, held-out evaluations, rollback, and evidence that simpler improvement methods have plateaued.

## Alternatives considered

- **Embed agents inside Next.js request handlers.** Rejected because research is long-running,
  resumable, and review-aware, while user-facing and Vercel execution paths should remain bounded.
- **Give the Python Agent Service direct Neon access.** Rejected because it would duplicate tenant,
  authorization, validation, and persistence rules across runtimes.
- **Use one unrestricted master agent.** Rejected in favor of one narrow copilot plus typed tools;
  specialist agents require evaluation evidence and separate capabilities.
- **Reuse `audit_jobs`.** Rejected because deterministic financial completion and interpretive
  review/revision lifecycles have different authority and throughput semantics.
- **Allow online self-learning or sales-reward optimization.** Rejected because it invites reward
  hacking, evidence sensationalism, unreviewed regressions, and irreversible data-governance problems.
