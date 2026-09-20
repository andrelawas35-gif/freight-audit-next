# ADR 0002 — Policy extraction stays in-process TypeScript until volume justifies a Python worker

- Status: Accepted
- Date: 2026-06-23
- Deciders: Policy Intelligence grilling session

## Context

Policy document extraction (clause → draft `policy_rules`) is the one new LLM-driven
subsystem in Policy Intelligence. A proposed stack named four tools: LlamaIndex for PDF
ingestion, LangGraph for orchestration, DeepInfra/Fireworks for cheap extraction, and
Claude/OpenAI as an escalation path.

Three of these are Python-first (LlamaIndex, LangGraph, and idiomatic use of the model
SDKs); their JS ports lag. The host system is TypeScript / Next.js 15 / Vercel serverless
/ Neon, with an existing Postgres job queue (`audit_jobs`, `FOR UPDATE SKIP LOCKED`) and a
precedent for suggest-only LLM calls in TS (`lib/ingestion/data-clerk.ts`, the dispute
parser). Current scale is the first 3–5 onboarding clients: low document volume, every
rule human-confirmed before activation.

Extraction is async, queued, and never in a user request path, so a separate service is
*architecturally permissible* — but it adds a second language, deploy target, and failure
domain.

## Decision

Default to **all-TypeScript, in the existing app/worker**:

- **Parsing** via LlamaParse's hosted REST API (no Python needed; no RAG/index
  requirement, so LlamaIndex-the-framework is not adopted).
- **Extraction** via the Vercel AI SDK calling Fireworks/DeepInfra (cheap) and
  Anthropic/OpenAI (escalation) over HTTP.
- **Orchestration** as a plain function chain on a new `policy_extract` job type in the
  existing queue — **not** LangGraph, and **not** a second state store.

Revisit and stand up a dedicated **Python worker** (FastAPI/Modal/Railway pulling jobs
from Neon) only when a concrete trigger fires: autonomous (non-human-gated) extraction
volume, or a genuine need for LangGraph-style cyclic self-correction / mid-graph human
interrupts that the function chain cannot express cleanly.

## Consequences

- One language, one deploy target, one queue, one suggest-only template to follow — lowest
  operational surface while the product is still being validated on a handful of clients.
- The model-routing and trust-boundary contracts ([`02-extraction.md`](../policy-intelligence/02-extraction.md))
  are language-agnostic, so a later move to Python changes the *runtime*, not the DB
  contract (draft-only rules, taxonomy/`PolicyCondition` Zod gate, lineage, escalation
  tripwires).
- We forgo the richer Python LlamaIndex/LangGraph ecosystem now; if high-volume autonomous
  extraction arrives, that capability is a re-platform of the worker, not a redesign.
- Hard constraint regardless of language: **no LLM in the gap analysis** — that path stays
  deterministic per [ADR 0001](0001-backtest-shipment-context-model.md).

## Alternatives considered

- **Python worker now (LlamaIndex + LangGraph).** Best-in-class frameworks, but a second
  language/deploy/failure domain for a low-volume, human-gated step — premature at current
  scale.
- **JS ports of LlamaIndex/LangGraph in-process.** Keeps one language but adopts the lagging
  ports' rough edges for capabilities (vector indexing, complex graphs) we do not yet need.
