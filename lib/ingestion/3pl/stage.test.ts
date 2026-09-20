import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FulfillmentLine, StorageLine } from './parse';

// WO 2026-09-19-001: stage.ts must write through sql.transaction() (ADR 0017,
// CLAUDE.md invariant #3), never raw BEGIN/COMMIT/ROLLBACK over sql.query.

const { query, transaction, fetchRecords } = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  fetchRecords: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getSql: () => ({ query, transaction }),
}));
vi.mock('@/lib/db/records', () => ({ fetchRecords }));

import { stageFulfillment, stageStorage } from './stage';

type Descriptor = { text: string; params: unknown[] };

// Runs the callback with a txn that returns unsent query descriptors, and
// records them so a test can assert what one transaction contained.
function captureTransaction() {
  const sent: Descriptor[][] = [];
  transaction.mockImplementation(async (cb: (txn: { query: (t: string, p: unknown[]) => Descriptor }) => Descriptor[]) => {
    const queries = cb({ query: (text, params) => ({ text, params }) });
    sent.push(queries);
    return queries.map(() => []);
  });
  return sent;
}

function fulfillmentLine(over: Partial<FulfillmentLine> = {}): FulfillmentLine {
  return {
    orderId: 'o1', wmsShipmentId: 'w1', trackingNumber: null, unitsPicked: 1,
    basePickFee: 1, additionalPickFee: 0, packagingFee: 0, billedDims: null, billedWeight: null,
    baseFreight: null, fuelSurcharge: null, totalBilled: 1, carrierPro: null, baseCarrierCost: null,
    raw: {}, ...over,
  };
}

function storageLine(over: Partial<StorageLine> = {}): StorageLine {
  return {
    sku: 'sku1', storageType: 'pallet', qtyOnHand: 1, cubicVolume: 1, locationId: 'A1', billedAmount: 1,
    raw: {}, ...over,
  };
}

const rawTransactionCalls = () =>
  query.mock.calls.filter(([text]) => /^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(String(text)));

beforeEach(() => {
  query.mockReset();
  transaction.mockReset();
  fetchRecords.mockReset();
  fetchRecords.mockResolvedValue([{ id: 'shp_1', 'Tracking number': 'trk1' }]);
});

describe('stageFulfillment', () => {
  it('writes every line in one sql.transaction() and never uses raw BEGIN/COMMIT', async () => {
    const sent = captureTransaction();
    const result = await stageFulfillment({
      clientId: 'c1', carrierScac: null, cycle: '2026-01',
      lines: [
        fulfillmentLine({ trackingNumber: 'TRK1' }), // matches shp_1 (case-insensitive)
        fulfillmentLine({ trackingNumber: 'nope' }),
        fulfillmentLine({ trackingNumber: null }),
      ],
    });

    expect(result).toEqual({ staged: 3, matched: 1, unmatched: 2 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(sent[0]).toHaveLength(3);
    expect(sent[0].every((q) => q.text.includes('INSERT INTO tpl_fulfillment_lines'))).toBe(true);
    // match_status ($18) and matched_shipment_id ($19) follow the tracking match
    expect(sent[0].map((q) => [q.params[17], q.params[18]])).toEqual([
      ['matched', 'shp_1'], ['unmatched', null], ['unmatched', null],
    ]);
    expect(rawTransactionCalls()).toHaveLength(0);
  });

  it('opens no transaction for an empty batch', async () => {
    captureTransaction();
    const result = await stageFulfillment({ clientId: 'c1', carrierScac: null, cycle: '2026-01', lines: [] });
    expect(result).toEqual({ staged: 0, matched: 0, unmatched: 0 });
    expect(transaction).not.toHaveBeenCalled();
    expect(rawTransactionCalls()).toHaveLength(0);
  });

  it('propagates a failed transaction and issues no raw ROLLBACK', async () => {
    transaction.mockRejectedValue(new Error('constraint violation'));
    await expect(
      stageFulfillment({ clientId: 'c1', carrierScac: null, cycle: '2026-01', lines: [fulfillmentLine()] }),
    ).rejects.toThrow('constraint violation');
    expect(rawTransactionCalls()).toHaveLength(0);
  });
});

describe('stageStorage', () => {
  it('writes every line in one sql.transaction() and never uses raw BEGIN/COMMIT', async () => {
    const sent = captureTransaction();
    const result = await stageStorage({ clientId: 'c1', cycle: '2026-01', lines: [storageLine(), storageLine({ sku: 'sku2' })] });

    expect(result).toEqual({ staged: 2 });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(sent[0]).toHaveLength(2);
    expect(sent[0].every((q) => q.text.includes('INSERT INTO tpl_storage_lines'))).toBe(true);
    expect(rawTransactionCalls()).toHaveLength(0);
  });

  it('opens no transaction for an empty batch', async () => {
    captureTransaction();
    expect(await stageStorage({ clientId: 'c1', cycle: '2026-01', lines: [] })).toEqual({ staged: 0 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('propagates a failed transaction and issues no raw ROLLBACK', async () => {
    transaction.mockRejectedValue(new Error('boom'));
    await expect(stageStorage({ clientId: 'c1', cycle: '2026-01', lines: [storageLine()] })).rejects.toThrow('boom');
    expect(rawTransactionCalls()).toHaveLength(0);
  });
});
