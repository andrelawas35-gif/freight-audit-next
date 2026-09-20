/**
 * lib/gateway/cache.ts — snapshot cache with simple TTL.
 *
 * In-memory Map with TTL (30 second default). Used by runPrecheck()
 * to avoid re-evaluating the same shipment within the TTL window.
 *
 * Cache key: `${clientId}:${trackingNumber}:${carrierScac}`
 */

import type { GatewayAction } from '@/lib/intelligence/taxonomy';
import type { PolicyDecision } from '@/lib/intelligence/policy-evaluator';

export interface CachedPrecheckResult {
  decisions: PolicyDecision[];
  risk_tier: 'low' | 'medium' | 'high';
  overall_action: GatewayAction;
  precheck_id: string;
}

interface CacheEntry {
  data: CachedPrecheckResult;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 30_000; // 30 seconds

export function getCachedPrecheck(key: string): CachedPrecheckResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedPrecheck(key: string, result: CachedPrecheckResult, ttlMs = DEFAULT_TTL_MS): void {
  cache.set(key, {
    data: result,
    expiresAt: Date.now() + ttlMs,
  });
}
