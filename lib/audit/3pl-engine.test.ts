import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, transaction, recordRun } = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  recordRun: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getSql: () => ({ query, transaction }),
}));
vi.mock('./rulebook', () => ({
  loadRulebook: vi.fn().mockResolvedValue([]),
  createResolver: vi.fn().mockReturnValue({}),
}));
vi.mock('./runs', () => ({ recordRun }));
vi.mock('./3pl-rules', () => ({
  FULFILLMENT_RULES: [],
  storageRule: vi.fn().mockReturnValue(null),
  duplicateFinding: vi.fn(),
}));

import { runThreePLAudit } from './3pl-engine';

function makeFulfillmentQuery(firstPage: unknown[], secondPage: unknown[]) {
  return (sqlText: string, params: unknown[]) => {
    const s = String(sqlText);

    // Fulfillment page queries
    if (s.includes('FROM tpl_fulfillment_lines') && s.includes('ORDER BY id ASC')) {
      const hasCursor = s.includes('id >');
      return Promise.resolve(hasCursor ? secondPage : firstPage);
    }

    // Storage queries
    if (s.includes('FROM tpl_storage_lines') && s.includes('ORDER BY id ASC')) {
      return Promise.resolve([]);
    }

    // Duplicate detection — earliest cycle by order
    if (s.includes('min(invoice_cycle)')) return Promise.resolve([]);

    // Mark lines audited
    if (s.startsWith('UPDATE tpl_fulfillment_lines')) return Promise.resolve([]);

    throw new Error(`Unexpected SQL in test: ${s}`);
  };
}

describe('3PL audit pagination', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue([]);
    // transaction mock: runs the callback, executes each query in the array
    transaction.mockReset().mockImplementation(
      (cb: (txn: { query: typeof query }) => unknown[]) =>
        Promise.resolve((cb({ query }) as unknown[]).map(() => [] as Record<string, unknown>[]))
    );
    recordRun.mockReset().mockResolvedValue(undefined);
  });

  it('processes pending fulfillment lines beyond the 500-row boundary', async () => {
    const firstPage = Array.from({ length: 500 }, (_, i) => ({
      id: `line${String(i + 1).padStart(4, '0')}`,
      client_id: 'client-1',
      order_id: null,
      invoice_cycle: '2026-06',
    }));
    const secondPage = [{
      id: 'line0501',
      client_id: 'client-1',
      order_id: null,
      invoice_cycle: '2026-06',
    }];

    query.mockImplementation(makeFulfillmentQuery(firstPage, secondPage));

    const summary = await runThreePLAudit({});

    expect(summary.linesChecked).toBe(501);
    expect(summary.findingsCreated).toBe(0);
    const updates = query.mock.calls.filter(([sqlText]) =>
      String(sqlText).startsWith('UPDATE tpl_fulfillment_lines')
    );
    expect(updates).toHaveLength(2);
    expect(updates[0][1][0]).toHaveLength(500);
    expect(updates[1][1][0]).toHaveLength(1);
    expect(recordRun).toHaveBeenCalledWith(expect.objectContaining({ invoicesChecked: 501 }));
  });

  it('wraps findings + mark-audited in sql.transaction() per page', async () => {
    const page = [{
      id: 'line-1',
      client_id: 'client-1',
      order_id: null,
      invoice_cycle: '2026-06',
    }];

    query.mockImplementation(makeFulfillmentQuery(page, []));

    await runThreePLAudit({});

    // Transaction should have been called (not raw BEGIN/COMMIT)
    expect(transaction).toHaveBeenCalled();
    // No raw BEGIN/COMMIT should reach query
    const sqlCalls = query.mock.calls.map(([sql]) => String(sql));
    expect(sqlCalls).not.toContain('BEGIN');
    expect(sqlCalls).not.toContain('COMMIT');
    expect(sqlCalls).not.toContain('ROLLBACK');
  });

  it('handles empty tables gracefully', async () => {
    query.mockImplementation(makeFulfillmentQuery([], []));

    const summary = await runThreePLAudit({});

    expect(summary.linesChecked).toBe(0);
    expect(summary.findingsCreated).toBe(0);
    expect(summary.errors).toHaveLength(0);
  });

  it('passes clientId filter through to SQL', async () => {
    query.mockImplementation(makeFulfillmentQuery([], []));

    await runThreePLAudit({ clientId: 'client-42' });

    const fulfillmentCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes('FROM tpl_fulfillment_lines')
    );
    expect(fulfillmentCalls.length).toBeGreaterThan(0);
    expect(fulfillmentCalls[0][1]).toContain('client-42');
  });
});
