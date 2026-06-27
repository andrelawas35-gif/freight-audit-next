/**
 * Tier Orchestrator (ADR 0012 D6)
 *
 * Runs the 4-tier classification pipeline for a batch of clauses:
 *   T1 (Deterministic Tokenizer) → T3 (Vector Memory Bank) → T2 (LLM Mapper) → T4 (Unmapped)
 *
 * T1 runs synchronously. T3 check runs per-clause after T1. T2 runs async with p-limit(5).
 * T3 store happens after successful T1 or T2 classification.
 */

import { tokenize, tokenizeAll } from './tokenizer';
import { findSimilarClauses, generateEmbedding, storeClauseEmbedding, getHighMatchCandidates, type VectorMatchResult, type HighMatchCandidate } from './embeddings';
import { classifyClause, type T2Result, type T2MappedResult } from './classifier';
import { storeUnmappedClause, upsertTaxonomyCandidate } from './policy-service';
import type { PolicyCondition, PolicyAction } from './policy-evaluator';
import type { TokenizerHit } from './tokenizer';
import { getSql } from '@/lib/db';

// ── Types ───────────────────────────────────────────────────────────

export type ClassificationSource = 'TOKENIZER' | 'VECTOR_MATCH' | 'LLM_MAPPER' | 'UNMAPPED' | 'CLIENT_EXCLUDED';

export interface ClassificationResult {
  clauseText: string;
  tier: 'T1' | 'T3' | 'T2' | 'T4';
  classificationSource: ClassificationSource;
  conditionJson?: PolicyCondition;
  action?: PolicyAction;
  confidence: number;
  mapped: boolean;
  reason?: string;
}

export interface PipelineResult {
  totalClauses: number;
  classified: ClassificationResult[];
  unmapped: ClassificationResult[];
  stats: {
    t1Hits: number;
    t3Hits: number;
    t2Mapped: number;
    t4Unmapped: number;
    t3NearMatches: number;
    totalCost: number;
  };
}

export interface PipelineOptions {
  /** If provided, T2-resolved clauses will be stored in embeddings for T3 reuse */
  documentId?: string;
  /** Max concurrent T2 LLM calls (default: 5) */
  concurrency?: number;
  /** Skip T2 LLM calls entirely (for cheap dry runs) */
  skipT2?: boolean;
  /** Client ID for T4 unmapped clause storage (routes to client ambiguity dashboard) */
  clientId?: string;
  /** Policy ID for T4 unmapped clause context */
  policyId?: string;
}

// ── Cost Tracking ───────────────────────────────────────────────────

const COST_PER_EMBEDDING = 0.00000002; // text-embedding-3-small ~$0.02/1M tokens
const COST_PER_T2_CALL = 0.00015; // gpt-4o-mini ~$0.15/1M input tokens
const COST_PER_CLAUDE_CALL = 0.003; // Claude Sonnet ~$3/1M input

function t2Cost(modelUsed: string): number {
  if (modelUsed === 'gpt-4o-mini') return COST_PER_T2_CALL;
  if (modelUsed.startsWith('claude')) return COST_PER_CLAUDE_CALL;
  return 0;
}

// ── T4 Exclusion Check ───────────────────────────────────────────────

/**
 * Check if a clause has been explicitly excluded by the client.
 * If excluded, skip T1-T3 — the clause is a client decision, not unclassified.
 */
async function isClauseExcluded(clientId: string, clauseText: string): Promise<{ excluded: boolean; reason?: string }> {
  try {
    const sql = await getSql();
    const rows = await sql.query(`
      SELECT reason FROM policy_scope_exclusions
      WHERE client_id = $1 AND clause_text = $2 AND status = 'excluded' AND deleted_at IS NULL
      LIMIT 1
    `, [clientId, clauseText]) as Record<string, unknown>[];
    if (rows.length > 0) {
      return { excluded: true, reason: String(rows[0].reason ?? 'Client excluded this clause.') };
    }
  } catch (err) {
    console.warn('[Pipeline] Exclusion check failed (non-fatal):', err instanceof Error ? err.message : err);
  }
  return { excluded: false };
}

// ── p-limit (inline, no external dep) ───────────────────────────────

function pLimit<T>(concurrency: number) {
  let running = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    running--;
    if (queue.length > 0) {
      queue.shift()!();
    }
  };

  return (fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        running++;
        fn().then(resolve, reject).finally(next);
      };
      if (running < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

// ── Pipeline ────────────────────────────────────────────────────────

/**
 * Classify a batch of policy clauses through the 4-tier extraction pipeline.
 *
 * Flow per clause:
 *   1. T1: Run deterministic tokenizer. Hit → done (source: TOKENIZER).
 *   2. T3: Generate embedding, search vector memory. >=0.92 → done (VECTOR_MATCH).
 *      Near-match 0.85-0.92 → flagged as T3_NEAR (staff review suggested).
 *   3. T2: Send to LLM mapper. Mapped → store in T3 → done (LLM_MAPPER).
 *   4. T4: Unmapped — route to client ambiguity dashboard (UNMAPPED).
 */
const SIMILARITY_THRESHOLD_FOR_LOG = process.env.EMBEDDING_SIMILARITY_THRESHOLD || '0.92';

export async function classify(
  clauses: string[],
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const { skipT2 = false, concurrency = 5 } = options;
  const limit = pLimit<T2Result>(concurrency);

  const results: ClassificationResult[] = new Array(clauses.length);
  const stats = {
    t1Hits: 0,
    t3Hits: 0,
    t2Mapped: 0,
    t4Unmapped: 0,
    t3NearMatches: 0,
    totalCost: 0,
  };

  // ── T2 queue (populated as we go, awaited at end) ─────────────────

  const t2Queue: Promise<void>[] = [];
  // Track which clauses need T2 — filled in the per-clause loop
  const t2Clauses: { text: string; idx: number }[] = [];

  // ── Per-clause: T1 → T3 ───────────────────────────────────────────

  for (let i = 0; i < clauses.length; i++) {
    const clauseText = clauses[i].trim();
    if (!clauseText) {
      results[i] = {
        clauseText: '',
        tier: 'T4',
        classificationSource: 'UNMAPPED',
        confidence: 0,
        mapped: false,
        reason: 'Empty clause',
      };
      stats.t4Unmapped++;
      continue;
    }

    // ── T4 Exclusion Check: skip already-excluded clauses ─────────
    if (options.clientId) {
      const { excluded, reason } = await isClauseExcluded(options.clientId, clauseText);
      if (excluded) {
        results[i] = {
          clauseText,
          tier: 'T4',
          classificationSource: 'CLIENT_EXCLUDED',
          confidence: 1,
          mapped: false,
          reason: reason || 'Client excluded this clause.',
        };
        continue;
      }
    }

    // ── T1: Deterministic tokenizer ──────────────────────────────────

    const t1Hit = tokenize(clauseText);
    if (t1Hit) {
      stats.t1Hits++;
      results[i] = {
        clauseText,
        tier: 'T1',
        classificationSource: 'TOKENIZER',
        conditionJson: t1Hit.conditionFragment as PolicyCondition,
        action: t1Hit.actionFragment as PolicyAction,
        confidence: t1Hit.confidence,
        mapped: true,
      };

      // Store T1 hit in T3 (fire-and-forget)
      storeT1Embedding(clauseText, t1Hit);
      continue;
    }

    // ── T3: Vector memory bank ──────────────────────────────────────

    const embedding = await generateEmbedding(clauseText);
    if (embedding) {
      stats.totalCost += COST_PER_EMBEDDING;

      const t3Match = await findSimilarClauses(embedding);
      if (t3Match.matched) {
        stats.t3Hits++;
        results[i] = {
          clauseText,
          tier: 'T3',
          classificationSource: 'VECTOR_MATCH',
          conditionJson: t3Match.conditionJson,
          confidence: t3Match.similarity,
          mapped: true,
        };
        continue;
      }

      if (t3Match.nearestSimilarity !== null && t3Match.nearestSimilarity >= 0.85) {
        // Near-match: flag for staff review, still try T2
        stats.t3NearMatches++;
        results[i] = {
          clauseText,
          tier: 'T3',
          classificationSource: 'VECTOR_MATCH',
          conditionJson: t3Match.conditionJson,
          confidence: t3Match.nearestSimilarity,
          mapped: true,
          reason: `Near-match at ${t3Match.nearestSimilarity.toFixed(3)} (threshold: ${SIMILARITY_THRESHOLD_FOR_LOG}). Awaiting T2 result.`,
        };
        // Fall through to T2 — overwrite with better result if T2 maps
      }
    }

    // ── Route to T2 (either no T3 match, or near-match we want to improve) ──
    t2Clauses.push({ text: clauseText, idx: i });
  }

  // ── T2: LLM mapper (concurrent, p-limit 5) ────────────────────────
  // We use t2Clauses to also capture near-match clauses that still need T2

  for (const { text, idx } of t2Clauses) {
    if (skipT2) {
      if (!results[idx]) {
        results[idx] = {
          clauseText: text,
          tier: 'T4',
          classificationSource: 'UNMAPPED',
          confidence: 0,
          mapped: false,
          reason: 'T2 skipped (skipT2 option)',
        };
        stats.t4Unmapped++;
      }
      continue;
    }

    const promise = limit(() => classifyClause(text))
      .then((t2Result) => {
        if (t2Result.mapped) {
          stats.t2Mapped++;
          stats.totalCost += t2Cost(t2Result.modelUsed);

          // Store in T3 (fire-and-forget)
          storeT2Embedding(text, t2Result);
        } else {
          // Only count as T4 if there wasn't already a near-match entry
          if (!results[idx]?.mapped) {
            stats.t4Unmapped++;
          }
        }

        // Only overwrite if T2 did better (or if there was no T3 near-match)
        results[idx] = t2Result.mapped
          ? {
              clauseText: text,
              tier: 'T2',
              classificationSource: 'LLM_MAPPER',
              conditionJson: t2Result.conditionJson,
              confidence: t2Result.confidence,
              mapped: true,
            }
          : (results[idx]?.mapped
              ? results[idx] // Keep near-match result
              : {
                  clauseText: text,
                  tier: 'T4',
                  classificationSource: 'UNMAPPED',
                  confidence: 0,
                  mapped: false,
                  reason: t2Result.reason,
                });
      });

    t2Queue.push(promise);
  }

  // Wait for all T2 calls to complete
  await Promise.all(t2Queue);

  // ── T4: Persist unmapped clauses for client ambiguity dashboard ─────
  if (options.clientId) {
    const unmappedClauses = results.filter(r => !r.mapped && r.clauseText);
    for (const uc of unmappedClauses) {
      storeUnmappedClause({
        clientId: options.clientId,
        policyId: options.policyId,
        clauseText: uc.clauseText,
      }).catch(err => {
        console.warn('[Pipeline] T4 storeUnmappedClause failed (non-fatal):', err instanceof Error ? err.message : err);
      });
    }
  }

  // ── Phase 4: Taxonomy discovery — L3 novel variable detection ────────
  // Grounded + unmappable constraints become taxonomy candidates.
  // All pipeline clauses are inherently grounded (extracted from real docs).
  // Ungrounded novel = hallucination, never staged (not possible from pipeline).
  if (options.clientId && options.policyId) {
    const groundedUnmapped = results.filter(r => !r.mapped && r.clauseText);
    for (const gu of groundedUnmapped) {
      // Generate a stable rule_key candidate from the clause text.
      // Identical clauses across clients naturally dedupe via upsertTaxonomyCandidate.
      const candidateKey = `l3_${normalizeForKey(gu.clauseText)}`;
      upsertTaxonomyCandidate({
        ruleKey: candidateKey,
        sourceClause: gu.clauseText,
        surfacingClientId: options.clientId,
        documentId: options.policyId,
      }).catch(err => {
        console.warn('[Pipeline] Phase 4 upsertTaxonomyCandidate failed (non-fatal):', err instanceof Error ? err.message : err);
      });
    }
  }

  // Separate classified from unmapped
  const classified = results.filter(r => r.mapped);
  const unmapped = results.filter(r => !r.mapped);

  return {
    totalClauses: clauses.length,
    classified,
    unmapped,
    stats,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

async function storeT1Embedding(clauseText: string, hit: TokenizerHit): Promise<void> {
  const embedding = await generateEmbedding(clauseText);
  if (!embedding) return;

  try {
    await storeClauseEmbedding({
      clauseText,
      embedding,
      classifiedRuleKey: hit.ruleKey,
      classifiedConditionJson: hit.conditionFragment as PolicyCondition,
      classificationSource: 'tokenizer',
    });
  } catch (err) {
    console.warn('[Pipeline] T1→T3 storage failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

async function storeT2Embedding(clauseText: string, t2Result: T2MappedResult): Promise<void> {
  const embedding = await generateEmbedding(clauseText);
  if (!embedding) return;

  try {
    await storeClauseEmbedding({
      clauseText,
      embedding,
      classifiedRuleKey: t2Result.ruleKey,
      classifiedConditionJson: t2Result.conditionJson,
      classificationSource: 'llm_mapper',
    });
  } catch (err) {
    console.warn('[Pipeline] T2→T3 storage failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

/** Generate a stable, deduplicable key from clause text for L3 candidate discovery. */
function normalizeForKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 48);
}

// ── T3 → T1 Feedback Loop ─────────────────────────────────────────

import { getKnownRuleKeys } from './tokenizer';

export type { HighMatchCandidate } from './embeddings';

/**
 * Return high-match T3 candidates that don't have a corresponding T1 pattern.
 * This is the "Consider adding T1 pattern" surface for the staff console.
 */
export async function getT3FeedbackCandidates(minCount: number = 10): Promise<HighMatchCandidate[]> {
  const knownKeys = getKnownRuleKeys();
  return getHighMatchCandidates(minCount, knownKeys);
}
