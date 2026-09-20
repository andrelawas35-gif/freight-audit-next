/**
 * T3 → T1 Feedback Panel
 *
 * Staff console surface showing high-match-count clause_embeddings
 * that don't yet have a corresponding T1 tokenizer pattern.
 *
 * Match count >= 10 triggers "Consider adding T1 pattern" display.
 */

import { getT3FeedbackCandidates, type HighMatchCandidate } from '@/lib/intelligence/pipeline';

export async function T3FeedbackPanel() {
  let candidates: HighMatchCandidate[] = [];
  try {
    candidates = await getT3FeedbackCandidates(10);
  } catch {
    // Degrade silently — T3 table may not exist yet or pgvector unavailable
    return null;
  }

  if (candidates.length === 0) return null;

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-700 dark:text-amber-400 text-lg">💡</span>
        <h3 className="font-semibold text-amber-900 dark:text-amber-300">
          Consider Adding T1 Patterns
        </h3>
        <span className="text-xs bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full font-mono">
          {candidates.length}
        </span>
      </div>

      <p className="text-sm text-amber-700 dark:text-amber-400 mb-4">
        These clause patterns have been matched {candidates[0]?.matchCount ?? 10}+ times
        by the T3 vector memory bank but don't have a deterministic T1 tokenizer rule.
        Adding a T1 pattern makes classification instant and free.
      </p>

      <div className="space-y-3">
        {candidates.slice(0, 15).map((c, i) => (
          <div
            key={`${c.classifiedRuleKey}-${i}`}
            className="rounded-md border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-900 p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-gray-700 dark:text-gray-300">
                    {c.classifiedRuleKey}
                  </code>
                  <span className="text-xs text-gray-400">
                    source: {c.classificationSource}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400 italic truncate max-w-lg">
                  &ldquo;{c.clauseText}&rdquo;
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{
                    backgroundColor:
                      c.matchCount >= 50
                        ? 'oklch(0.65 0.25 27 / 0.15)'
                        : c.matchCount >= 25
                          ? 'oklch(0.65 0.15 75 / 0.15)'
                          : 'oklch(0.5 0.05 220 / 0.1)',
                    color:
                      c.matchCount >= 50
                        ? 'oklch(0.4 0.2 27)'
                        : c.matchCount >= 25
                          ? 'oklch(0.4 0.1 75)'
                          : 'oklch(0.4 0.05 220)',
                  }}
                >
                  {c.matchCount}&times;
                </span>
              </div>
            </div>

            {c.classifiedConditionJson && Object.keys(c.classifiedConditionJson).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(c.classifiedConditionJson).map(([k, v]) => (
                  <span
                    key={k}
                    className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-gray-500 dark:text-gray-400"
                  >
                    {k}: {JSON.stringify(v)}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {candidates.length > 15 && (
        <p className="text-xs text-gray-400 mt-3">
          Showing 15 of {candidates.length} candidates. Promote the highest-impact ones first.
        </p>
      )}
    </section>
  );
}
