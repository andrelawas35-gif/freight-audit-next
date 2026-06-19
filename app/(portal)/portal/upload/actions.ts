/*
  app/(portal)/portal/upload/actions.ts — handle client shipment CSV upload.

  Reads the uploaded CSV server-side, parses rows into NormalizedShipment[],
  stages them in Neon scoped to the signed-in user's client, records an upload
  log entry (audit trail), and reports a data-health score.
*/

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { parseClientShipmentCsv } from '@/lib/ingestion/client/generic-csv';
import { stageClientShipment } from '@/lib/ingestion/normalize';
import { recordUpload } from '@/lib/ingestion/uploads';

export type UploadResult = {
  ok: boolean;
  staged?: number;
  rows?: number;
  skipped?: number;
  failed?: number;
  dataHealth?: number;
  error?: string;
};

export async function uploadShipments(
  _prev: UploadResult | undefined,
  formData: FormData
): Promise<UploadResult> {
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
    });
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
      console.error('stageClientShipment failed:', err);
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
  });

  revalidatePath('/portal/upload');
  revalidatePath('/portal');

  return { ok: true, staged, rows: rowCount, skipped, failed, dataHealth };
}
