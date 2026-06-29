/*
  app/(portal)/portal/upload/actions.ts — handle client uploads (CSV + document types).

  Reads the uploaded CSV server-side, parses rows into NormalizedShipment[],
  stages them in Neon scoped to the signed-in user's client, records an upload
  log entry (audit trail), and reports a data-health score.

  For non-CSV document types (insurance, contract, SOP, claims), stores metadata
  and returns pipeline acknowledgment.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { parseClientShipmentCsv } from '@/lib/ingestion/client/generic-csv';
import { stageClientShipment } from '@/lib/ingestion/normalize';
import { recordUpload } from '@/lib/ingestion/uploads';
import {
  getPipelineMessage,
  recordDocumentUpload,
  type DocumentType,
  DOCUMENT_TYPES,
} from '@/lib/portal/upload-router';
import { log, withCorrelationId, generateCorrelationId } from '@/lib/logger';

export type UploadResult = {
  ok: boolean;
  staged?: number;
  rows?: number;
  skipped?: number;
  failed?: number;
  dataHealth?: number;
  documentType?: string;
  message?: string;
  error?: string;
};

export async function uploadShipments(
  _prev: UploadResult | undefined,
  formData: FormData
): Promise<UploadResult> {
  return withCorrelationId(generateCorrelationId(), async () => {
    const session = await auth();
    const clientId = session?.user?.clientId;
    if (!clientId) {
      return { ok: false, error: 'Your account is not linked to a client company yet.' };
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Please choose a CSV file to upload.' };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: 'File is too large (max 10 MB).' };
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      return { ok: false, error: 'Could not read the file.' };
    }

    const { shipments, rowCount, skipped, dataHealth } = parseClientShipmentCsv(text, clientId);

    if (shipments.length === 0) {
      await recordUpload({
        clientId,
        uploadedBy: session.user?.email ?? null,
        fileName: file.name,
        rows: rowCount,
        staged: 0,
        skipped,
        failed: 0,
        dataHealth: 0,
        status: 'no_rows',
        documentType: 'shipment_csv',
      });
      log.warn('upload produced no usable rows', { clientId, fileName: file.name, rowCount, skipped });
      revalidatePath('/portal/upload');
      return {
        ok: false,
        error:
          'No usable rows found. Each row needs at least a tracking number or PRO number. Check your column headers.',
        rows: rowCount,
        skipped,
      };
    }

    let staged = 0;
    let failed = 0;
    for (const s of shipments) {
      try {
        await stageClientShipment(s);
        staged++;
      } catch (err) {
        failed++;
        log.error('stageClientShipment failed during upload', { err: err as Error, clientId });
      }
    }

    await recordUpload({
      clientId,
      uploadedBy: session.user?.email ?? null,
      fileName: file.name,
      rows: rowCount,
      staged,
      skipped,
      failed,
      dataHealth,
      status: failed > 0 ? 'partial' : 'ok',
      documentType: 'shipment_csv',
    });

    log.info('client CSV upload completed', {
      clientId,
      fileName: file.name,
      rows: rowCount,
      staged,
      skipped,
      failed,
      dataHealth,
    });

    revalidatePath('/portal/upload');
    revalidatePath('/portal');

    return { ok: true, staged, rows: rowCount, skipped, failed, dataHealth, documentType: 'shipment_csv' };
  });
}

export async function uploadDocument(
  _prev: UploadResult | undefined,
  formData: FormData
): Promise<UploadResult> {
  return withCorrelationId(generateCorrelationId(), async () => {
    const session = await auth();
    const clientId = session?.user?.clientId;
    if (!clientId) {
      return { ok: false, error: 'Your account is not linked to a client company yet.' };
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Please choose a file to upload.' };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: 'File is too large (max 10 MB).' };
    }

    const docTypeRaw = formData.get('document_type');
    const documentType = typeof docTypeRaw === 'string' ? docTypeRaw : 'shipment_csv';

    // Validate document type
    if (!DOCUMENT_TYPES.includes(documentType as DocumentType)) {
      return { ok: false, error: `Unknown document type: ${documentType}` };
    }

    // For shipment_csv, delegate to existing uploadShipments logic
    if (documentType === 'shipment_csv') {
      return uploadShipments(_prev, formData);
    }

    // For document types, store a record and return acknowledgment
    try {
      await recordDocumentUpload({
        clientId,
        uploadedBy: session.user?.email ?? null,
        fileName: file.name,
        documentType: documentType as DocumentType,
      });

      log.info('document upload recorded', {
        clientId,
        fileName: file.name,
        documentType,
      });

      revalidatePath('/portal/upload');
      revalidatePath('/portal');

      return {
        ok: true,
        rows: 0,
        staged: 0,
        skipped: 0,
        dataHealth: 0,
        documentType,
        message: getPipelineMessage(documentType as DocumentType),
      };
    } catch (err) {
      log.error('document upload failed', { err: err as Error, clientId, documentType });
      return { ok: false, error: String(err) };
    }
  });
}
