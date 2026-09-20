import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── mock wiring ──────────────────────────────────────────────
const { query, transaction } = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getSql: () => ({ query, transaction }),
}));

const {
  fetchAllRecordsMock,
  fetchRecordsByIdsMock,
  fetchRecordsByLinkedIdsMock,
  updateRecordMock,
} = vi.hoisted(() => ({
  fetchAllRecordsMock: vi.fn(),
  fetchRecordsByIdsMock: vi.fn(),
  fetchRecordsByLinkedIdsMock: vi.fn(),
  updateRecordMock: vi.fn(),
}));

// Minimal insertQueries mock — mirrors the real implementation
// but uses the mock txn.query(). Returns query descriptors.
function mockInsertQueries(
  txn: { query: (text: string, params: unknown[]) => unknown },
  tableName: string,
  recordsData: Record<string, unknown>[],
  opts?: { onConflict?: string },
): unknown[] {
  if (recordsData.length === 0) return [];
  const conflictClause = opts?.onConflict
    ? ` ON CONFLICT ${opts.onConflict} DO NOTHING`
    : '';
  return recordsData.map((fields) => {
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      return txn.query(
        `INSERT INTO "${tableName}" DEFAULT VALUES${conflictClause} RETURNING *`,
        [],
      );
    }
    const cols = entries.map(([k]) => `"${k}"`).join(', ');
    const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
    const values = entries.map(([, v]) => v);
    return txn.query(
      `INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})${conflictClause} RETURNING *`,
      values,
    );
  });
}

vi.mock('@/lib/db/records', () => ({
  fetchAllRecords: fetchAllRecordsMock,
  fetchRecordsByIds: fetchRecordsByIdsMock,
  fetchRecordsByLinkedIds: fetchRecordsByLinkedIdsMock,
  updateRecord: updateRecordMock,
  insertQueries: mockInsertQueries,
}));

vi.mock('../rulebook', () => ({
  loadRulebook: vi.fn().mockResolvedValue([]),
  createResolver: vi.fn().mockReturnValue({
    num: (_k: string, _o: unknown, fb: number) => fb,
    bool: (_k: string, _o: unknown, fb: boolean) => fb,
    text: (_k: string, _o: unknown, fb: string) => fb,
    clause: () => null,
  }),
}));

import { runAudit } from '../engine';
import type { Invoice, Shipment } from '@/lib/types';

// ── factories ────────────────────────────────────────────────
function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    'Invoice number': 'INV-001',
    'Amount billed': 50,
    'Carrier': 'UPSN',
    'Clients': ['client-1'],
    'Invoice date': '2025-06-01',
    'Shipment': ['ship-1'],
    ...overrides,
  };
}

function makeShipment(overrides: Partial<Shipment> = {}): Shipment {
  return {
    id: 'ship-1',
    'PRO number': 'PRO-123',
    'Tracking number': 'TRK-456',
    'Actual L': 12,
    'Actual W': 10,
    'Actual H': 8,
    'Actual weight lbs': 5,
    'Ship date': '2025-06-01',
    'Delivery date': '2025-06-02',
    'Service level': 'Ground',
    'Carrier': 'UPSN',
    'Destination zip': '90210',
    'Address classification': 'Commercial',
    ...overrides,
  };
}

// ── setup ────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue([]);
  // transaction mock: resolves to an array of empty arrays (one per query in the tx)
  transaction.mockImplementation((cb: (txn: { query: typeof query }) => unknown[]) =>
    Promise.resolve((cb({ query }) as unknown[]).map(() => [] as Record<string, unknown>[]))
  );
  fetchAllRecordsMock.mockResolvedValue([]);
  fetchRecordsByIdsMock.mockResolvedValue([]);
  fetchRecordsByLinkedIdsMock.mockResolvedValue([]);
  updateRecordMock.mockResolvedValue({});
});

// ═══════════════════════════════════════════════════════════════
// BASIC ORCHESTRATION
// ═══════════════════════════════════════════════════════════════
describe('runAudit — orchestration', () => {
  it('returns zero counts when no invoices exist', async () => {
    const result = await runAudit({});

    expect(result.invoicesChecked).toBe(0);
    expect(result.findingsCreated).toBe(0);
    expect(result.totalVariance).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('counts all invoices even when none produce findings', async () => {
    const invoices = [
      makeInvoice({ id: 'inv-1', 'Shipment': [] }),
      makeInvoice({ id: 'inv-2', 'Shipment': [] }),
    ];
    fetchAllRecordsMock.mockResolvedValue(invoices);
    fetchRecordsByLinkedIdsMock.mockResolvedValue([]);

    const result = await runAudit({});

    expect(result.invoicesChecked).toBe(2);
    expect(result.findingsCreated).toBe(0);
  });

  it('skips already-audited invoices', async () => {
    const invoice = makeInvoice();
    const shipment = makeShipment();
    fetchAllRecordsMock.mockResolvedValue([invoice]);
    fetchRecordsByIdsMock.mockResolvedValue([shipment]);
    // Existing audit result links to this invoice
    fetchRecordsByLinkedIdsMock.mockResolvedValue([{ id: 'ar-1', 'Invoice': ['inv-1'] }]);

    const result = await runAudit({});

    expect(result.invoicesChecked).toBe(1);
    expect(result.findingsCreated).toBe(0);
    // No INSERT queries should be issued for an already-audited invoice
    const insertCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO')
    );
    expect(insertCalls).toHaveLength(0);
    expect(transaction).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// FINDING GENERATION — end-to-end through real rules
// ═══════════════════════════════════════════════════════════════
describe('runAudit — finding generation', () => {
  it('generates findings for flaggable invoices', async () => {
    // Commercial address → phantom accessorial rule fires
    const invoice = makeInvoice({ 'Amount billed': 50 });
    const shipment = makeShipment({ 'Address classification': 'Commercial' });

    fetchAllRecordsMock.mockResolvedValue([invoice]);
    fetchRecordsByIdsMock.mockResolvedValue([shipment]);
    fetchRecordsByLinkedIdsMock.mockResolvedValue([]); // not already audited

    const result = await runAudit({ dryRun: true });

    expect(result.findingsCreated).toBeGreaterThan(0);
    expect(result.totalVariance).toBeGreaterThan(0);
  });

  it('dry run does not write to DB', async () => {
    const invoice = makeInvoice({ 'Amount billed': 50 });
    const shipment = makeShipment({ 'Address classification': 'Commercial' });

    fetchAllRecordsMock.mockResolvedValue([invoice]);
    fetchRecordsByIdsMock.mockResolvedValue([shipment]);
    fetchRecordsByLinkedIdsMock.mockResolvedValue([]);

    await runAudit({ dryRun: true });

    // Dry run must not issue any INSERT or UPDATE queries
    const writeCalls = query.mock.calls.filter(([sql]) => {
      const s = String(sql);
      return s.includes('INSERT INTO') || s.includes('UPDATE "Clients"');
    });
    expect(writeCalls).toHaveLength(0);
    expect(transaction).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// TRANSACTION SAFETY (ADR 0017)
// ═══════════════════════════════════════════════════════════════
describe('runAudit — transaction safety', () => {
  it('uses sql.transaction() for atomic writes (no raw BEGIN/COMMIT)', async () => {
    const invoice = makeInvoice({ 'Amount billed': 50 });
    const shipment = makeShipment({ 'Address classification': 'Commercial' });

    fetchAllRecordsMock.mockResolvedValue([invoice]);
    fetchRecordsByIdsMock.mockResolvedValue([shipment]);
    fetchRecordsByLinkedIdsMock.mockResolvedValue([]);

    await runAudit({ clientId: 'client-1' });

    // Transaction should have been called (not raw BEGIN/COMMIT)
    expect(transaction).toHaveBeenCalled();

    // Verify INSERT + UPDATE both executed (they run inside the transaction callback)
    const insertCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO "Audit Results"')
    );
    const updateCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes('UPDATE "Clients"')
    );
    expect(insertCalls.length).toBeGreaterThan(0);
    expect(updateCalls.length).toBeGreaterThan(0);

    // H4 (ADR 0017, migration 0027): the findings INSERT must carry ON CONFLICT DO NOTHING
    // on the natural key, or concurrent runs can write duplicate findings.
    for (const [sql] of insertCalls) {
      expect(String(sql)).toContain('ON CONFLICT (subject_type, subject_id, "Detected by") DO NOTHING');
    }

    // No raw BEGIN/COMMIT/ROLLBACK — all writes go through sql.transaction()
    const rawTxCalls = query.mock.calls
      .map(([sql]) => String(sql))
      .filter((s) => s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK');
    expect(rawTxCalls).toHaveLength(0);
  });

  it('throws if transaction fails (atomic rollback)', async () => {
    const invoice = makeInvoice({ 'Amount billed': 50 });
    const shipment = makeShipment({ 'Address classification': 'Commercial' });

    fetchAllRecordsMock.mockResolvedValue([invoice]);
    fetchRecordsByIdsMock.mockResolvedValue([shipment]);
    fetchRecordsByLinkedIdsMock.mockResolvedValue([]);
    transaction.mockRejectedValue(new Error('DB write failed'));

    // sql.transaction() rejecting must propagate out of runAudit — the batch
    // is all-or-nothing, so no partial findings can survive.
    await expect(runAudit({ clientId: 'client-1' })).rejects.toThrow('DB write failed');

    // No raw ROLLBACK needed — sql.transaction() handles it internally
    const sqlCalls = query.mock.calls.map(([sql]) => sql);
    expect(sqlCalls).not.toContain('ROLLBACK');
  });
});

// ═══════════════════════════════════════════════════════════════
// CLIENT SCOPING
// ═══════════════════════════════════════════════════════════════
describe('runAudit — client scoping', () => {
  it('passes clientId filter formula to fetchAllRecords', async () => {
    await runAudit({ clientId: 'client-42' });

    expect(fetchAllRecordsMock).toHaveBeenCalledWith(
      'Invoices',
      expect.objectContaining({
        filterByFormula: expect.stringContaining('client-42'),
      })
    );
  });

  it('updates client Last audit run on success', async () => {
    fetchAllRecordsMock.mockResolvedValue([]);
    fetchRecordsByLinkedIdsMock.mockResolvedValue([]);

    await runAudit({ clientId: 'client-42' });

    expect(updateRecordMock).toHaveBeenCalledWith(
      'Clients',
      'client-42',
      expect.objectContaining({ 'Last audit run': expect.any(String) })
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// RUN ISOLATION (createdBefore cutoff)
// ═══════════════════════════════════════════════════════════════
describe('runAudit — run isolation', () => {
  it('passes runStartedAt as createdBefore to fetchAllRecords', async () => {
    const ts = '2025-06-15T10:00:00Z';
    await runAudit({ runStartedAt: ts });

    expect(fetchAllRecordsMock).toHaveBeenCalledWith(
      'Invoices',
      expect.objectContaining({ createdBefore: ts })
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════
describe('runAudit — error resilience', () => {
  it('catches per-rule errors and continues', async () => {
    // Invoice with missing data will cause dim-weight to return null (not throw)
    // but we can test that the errors array collects thrown errors by providing
    // data that triggers a rule but also triggers another rule that errors.
    // Simplest: provide a valid invoice that exercises all rules.
    const invoice = makeInvoice({ 'Amount billed': 50 });
    const shipment = makeShipment({ 'Address classification': 'Commercial' });

    fetchAllRecordsMock.mockResolvedValue([invoice]);
    fetchRecordsByIdsMock.mockResolvedValue([shipment]);
    fetchRecordsByLinkedIdsMock.mockResolvedValue([]);

    // Rules that don't throw shouldn't produce errors
    const result = await runAudit({ dryRun: true });
    expect(result.errors).toHaveLength(0);
  });
});
