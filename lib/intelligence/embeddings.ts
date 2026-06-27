/**
 * T3 Vector Memory Bank (ADR 0012 D4)
 * 
 * Cross-tenant semantic cache for classified policy clauses.
 * Once a clause is classified (by T1 or T2), it's embedded and stored.
 * Future near-matches skip T2 entirely.
 *
 * Tri-band threshold:
 *   >= 0.92 → auto-apply (VECTOR_MATCH)
 *   0.85-0.919 → near-match (staff review suggested)
 *   < 0.85 → no match (send to T2)
 *
 * Degrades gracefully when OPENAI_API_KEY is not configured.
 */

import { getSql } from '@/lib/db';
import type { PolicyCondition, PolicyAction } from './policy-evaluator';

// ── Config ──────────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const SIMILARITY_THRESHOLD = parseFloat(process.env.EMBEDDING_SIMILARITY_THRESHOLD || '0.92');
const NEAR_MATCH_LOWER = 0.85;

// ── Types ───────────────────────────────────────────────────────────

export type EmbeddingSource = 'tokenizer' | 'llm_mapper';

export type VectorMatchResult =
  | { matched: true; similarity: number; ruleKey: string; conditionJson: PolicyCondition; source: EmbeddingSource; matchCount: number }
  | { matched: false; nearestSimilarity: number | null; ruleKey?: string; conditionJson?: PolicyCondition };

export type T3Result =
  | { tier: 'T3'; source: 'VECTOR_MATCH'; confidence: number; ruleKey: string; conditionJson: PolicyCondition; action?: PolicyAction; matchCount: number }
  | { tier: 'T3_NEAR'; source: 'VECTOR_MATCH'; confidence: number; ruleKey: string; conditionJson: PolicyCondition; matchCount: number; similarity: number }
  | { tier: 'T2_MISS'; source: 'VECTOR_MATCH'; nearestSimilarity: number | null };

export interface StoredEmbedding {
  clauseText: string;
  embedding: number[];
  classifiedRuleKey: string;
  classifiedConditionJson: PolicyCondition;
  classificationSource: EmbeddingSource;
}

// ── Embedding Generation ────────────────────────────────────────────

async function callOpenAIEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI embedding API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/** Generate embedding vector. Returns null if no API key configured. */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    return await callOpenAIEmbedding(text);
  } catch (err) {
    console.error('[T3] Embedding generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Cosine Similarity ───────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

// ── Similarity Search ───────────────────────────────────────────────

/** Search clause_embeddings by cosine similarity. Returns null when pgvector unavailable. */
async function searchByEmbedding(embedding: number[]): Promise<{
  clauseText: string;
  ruleKey: string;
  conditionJson: PolicyCondition;
  source: EmbeddingSource;
  matchCount: number;
  similarity: number;
} | null> {
  const sql = getSql();
  const vectorStr = `[${embedding.map(v => v.toString()).join(',')}]`;

  try {
    // Use vector operator directly (parameterization with pgvector literal)
    const rawRows = await sql.query(
      `SELECT 
        clause_text,
        classified_rule_key,
        classified_condition_json,
        classification_source,
        match_count,
        (1 - (embedding <=> $1::vector)) AS similarity
      FROM clause_embeddings
      WHERE embedding IS NOT NULL
        AND (1 - (embedding <=> $1::vector)) >= $2
      ORDER BY similarity DESC
      LIMIT 1`,
      [vectorStr, NEAR_MATCH_LOWER]
    );
    const rows = rawRows as Record<string, unknown>[];

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      clauseText: row.clause_text as string,
      ruleKey: row.classified_rule_key as string,
      conditionJson: row.classified_condition_json as PolicyCondition,
      source: row.classification_source as EmbeddingSource,
      matchCount: row.match_count as number,
      similarity: parseFloat(String(row.similarity)),
    };
  } catch (err) {
    console.warn('[T3] Vector search failed (pgvector may not be enabled):', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Check T3 for a semantically similar clause.
 * Returns tri-band result: auto-match (>=0.92), near-match (0.85-0.919), or miss (<0.85/null).
 */
export async function findSimilarClauses(embedding: number[] | null): Promise<VectorMatchResult> {
  if (!embedding) return { matched: false, nearestSimilarity: null };

  const match = await searchByEmbedding(embedding);
  if (!match) return { matched: false, nearestSimilarity: null };

  if (match.similarity >= SIMILARITY_THRESHOLD) {
    return {
      matched: true,
      similarity: match.similarity,
      ruleKey: match.ruleKey,
      conditionJson: match.conditionJson,
      source: match.source,
      matchCount: match.matchCount,
    };
  }

  return {
    matched: false,
    nearestSimilarity: match.similarity,
    ruleKey: match.ruleKey,
    conditionJson: match.conditionJson,
  };
}

/**
 * Store a classified clause embedding. Upserts on (clause_text, classified_rule_key).
 * Increments match_count if already exists.
 */
export async function storeClauseEmbedding(entry: StoredEmbedding): Promise<void> {
  const sql = getSql();
  const vectorStr = `[${entry.embedding.map(v => v.toString()).join(',')}]`;

  try {
    await sql.query(
      `INSERT INTO clause_embeddings (
        clause_text, embedding, classified_rule_key, classified_condition_json,
        classification_source, match_count, first_seen_at, last_matched_at
      ) VALUES ($1, $2::vector, $3, $4::jsonb, $5, 1, NOW(), NOW())
      ON CONFLICT (clause_text, classified_rule_key)
      DO UPDATE SET
        match_count = clause_embeddings.match_count + 1,
        last_matched_at = NOW()`,
      [entry.clauseText, vectorStr, entry.classifiedRuleKey, JSON.stringify(entry.classifiedConditionJson), entry.classificationSource]
    );
  } catch (err) {
    console.warn('[T3] Failed to store embedding (pgvector may not be enabled):', err instanceof Error ? err.message : err);
  }
}

// ── T3 → T1 Feedback Loop ─────────────────────────────────────────

export interface HighMatchCandidate {
  clauseText: string;
  classifiedRuleKey: string;
  classifiedConditionJson: PolicyCondition;
  classificationSource: EmbeddingSource;
  matchCount: number;
  lastMatchedAt: string;
  firstSeenAt: string;
}

/**
 * Return clauses from clause_embeddings whose match_count >= minCount,
 * excluding those whose rule_key already exists in the T1 tokenizer.
 * Used by the staff console "Consider adding T1 pattern" surface.
 */
export async function getHighMatchCandidates(
  minCount: number = 10,
  excludeRuleKeys?: Set<string>,
): Promise<HighMatchCandidate[]> {
  const sql = getSql();
  try {
    const rows = await sql.query(
      `SELECT 
        clause_text,
        classified_rule_key,
        classified_condition_json,
        classification_source,
        match_count,
        last_matched_at,
        first_seen_at
      FROM clause_embeddings
      WHERE match_count >= $1
        AND deleted_at IS NULL
      ORDER BY match_count DESC, last_matched_at DESC
      LIMIT 100`,
      [minCount]
    );

    const candidates = (rows as Record<string, unknown>[]).map((row) => ({
      clauseText: row.clause_text as string,
      classifiedRuleKey: row.classified_rule_key as string,
      classifiedConditionJson: row.classified_condition_json as PolicyCondition,
      classificationSource: row.classification_source as EmbeddingSource,
      matchCount: row.match_count as number,
      lastMatchedAt: String(row.last_matched_at || ''),
      firstSeenAt: String(row.first_seen_at || ''),
    }));

    // Filter out already-known T1 patterns
    if (excludeRuleKeys && excludeRuleKeys.size > 0) {
      return candidates.filter(c => !excludeRuleKeys.has(c.classifiedRuleKey));
    }
    return candidates;
  } catch (err) {
    console.warn('[T3] getHighMatchCandidates failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
