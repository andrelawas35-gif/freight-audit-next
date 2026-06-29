/*
  lib/ingestion/lineage.ts

  Ingestion lineage tracking: every intake event gets a batch, every staged record
  gets a lineage row linking raw payload → staged record → eventual audit outcome.

  Usage:
    const batchId = await startBatch('API', { carrierScac: 'FDXG' });
    // ... stage records ...
    await trackRecord(batchId, rawPayload, 'invoice', stagedId);
    await finishBatch(batchId, { stagedCount: 5, errorCount: 1 });
*/

import { createRecord, updateRecord } from '@/lib/db/records';

interface BatchMetadata {
  carrierScac?: string;
  clientId?: string;
  fileName?: string;
  fileSize?: number;
  [key: string]: unknown;
}

interface BatchCounts {
  rowCount?: number;
  stagedCount?: number;
  errorCount?: number;
}

export async function startBatch(
  source: string,
  metadata?: BatchMetadata
): Promise<string> {
  const batch = await createRecord('ingestion_batches', {
    source,
    carrier_scac: metadata?.carrierScac ?? null,
    client_id: metadata?.clientId ?? null,
    file_name: metadata?.fileName ?? null,
    file_size: metadata?.fileSize ?? null,
    row_count: 0,
    staged_count: 0,
    error_count: 0,
    status: 'processing',
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
  return batch.id;
}

export async function finishBatch(
  batchId: string,
  counts: BatchCounts
): Promise<void> {
  const updates: Record<string, unknown> = {
    status: 'completed',
    updated_at: new Date().toISOString(),
  };
  if (counts.rowCount !== undefined) updates.row_count = counts.rowCount;
  if (counts.stagedCount !== undefined) updates.staged_count = counts.stagedCount;
  if (counts.errorCount !== undefined) updates.error_count = counts.errorCount;
  if ((counts.errorCount ?? 0) > 0 && counts.stagedCount) {
    updates.status = 'partial';
  } else if ((counts.errorCount ?? 0) > 0 && !counts.stagedCount) {
    updates.status = 'failed';
  }

  await updateRecord('ingestion_batches', batchId, updates);
}

export async function trackRecord(
  batchId: string,
  rawPayload: unknown,
  normalizedType: 'invoice' | 'shipment' | 'fulfillment' | 'storage',
  stagedRecordId: string,
  errors?: unknown[]
): Promise<string> {
  const record = await createRecord('ingestion_records', {
    batch_id: batchId,
    raw_payload: rawPayload ? JSON.stringify(rawPayload) : null,
    normalized_type: normalizedType,
    staged_record_id: stagedRecordId,
    status: errors?.length ? 'staged' : 'staged',  // still staged with warnings
    errors: errors?.length ? JSON.stringify(errors) : null,
  });
  return record.id;
}
