import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();

vi.mock('@/lib/db', () => ({
  getSql: () => ({ query }),
}));

import {
  fetchAllRecords,
  fetchRecordsByIds,
  fetchRecordsByLinkedIds,
} from './db/records';

describe('complete record reads', () => {
  beforeEach(() => query.mockReset());

  it('continues keyset pagination until the final partial page', async () => {
    query
      .mockResolvedValueOnce([{ id: 'rec001' }, { id: 'rec002' }])
      .mockResolvedValueOnce([{ id: 'rec003' }, { id: 'rec004' }])
      .mockResolvedValueOnce([{ id: 'rec005' }]);

    const rows = await fetchAllRecords('Invoices', { pageSize: 2 });

    expect(rows.map((row) => row.id)).toEqual([
      'rec001', 'rec002', 'rec003', 'rec004', 'rec005',
    ]);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][1]).toEqual([2]);
    expect(query.mock.calls[1][1]).toEqual(['rec002', 2]);
    expect(query.mock.calls[2][1]).toEqual(['rec004', 2]);
    expect(query.mock.calls[1][0]).toContain('id > $1');
  });

  it('chunks linked record ids instead of truncating after 500', async () => {
    query
      .mockResolvedValueOnce([{ id: 'ship001' }])
      .mockResolvedValueOnce([{ id: 'ship501' }])
      .mockResolvedValueOnce([{ id: 'ship1001' }]);

    const ids = Array.from({ length: 1_201 }, (_, i) => `ship${i + 1}`);
    const rows = await fetchRecordsByIds('Shipments', ids, 500);

    expect(rows).toHaveLength(3);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls.map((call) => call[1][0].length)).toEqual([500, 500, 201]);
  });

  it('de-duplicates audit results returned by overlapping link chunks', async () => {
    query
      .mockResolvedValueOnce([{ id: 'audit001' }, { id: 'audit-shared' }])
      .mockResolvedValueOnce([{ id: 'audit-shared' }, { id: 'audit002' }]);

    const rows = await fetchRecordsByLinkedIds(
      'Audit Results',
      'Invoice',
      ['inv001', 'inv002', 'inv003'],
      2
    );

    expect(rows.map((row) => row.id)).toEqual(['audit001', 'audit-shared', 'audit002']);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('"Invoice" && $1::text[]');
  });
});
