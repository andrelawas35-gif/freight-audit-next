/*
  lib/ingestion/uploads.ts — persistence for client CSV upload history.

  Server-only. Records each upload so the portal can show an audit trail
  (prevents double-uploads, gives controllers a paper trail).
*/

import { getSql } from '@/lib/db';

export type UploadLog = {
  id: string;
  created_at: string;
  client_id: string | null;
  uploaded_by: string | null;
  file_name: string | null;
  document_type?: string;
  rows: number;
  staged: number;
  skipped: number;
  failed: number;
  data_health: number;
  status: string;
};

export async function listUploads(clientId: string, limit = 20): Promise<UploadLog[]> {
  const sql = getSql();

  // Check if document_type column exists (added post-baseline)
  const hasDocType = await columnExists(sql, 'upload_logs', 'document_type');

  const cols = hasDocType
    ? 'id, created_at, client_id, uploaded_by, file_name, document_type, rows, staged, skipped, failed, data_health, status'
    : 'id, created_at, client_id, uploaded_by, file_name, NULL::text as document_type, rows, staged, skipped, failed, data_health, status';

  return (await sql.query(
    `SELECT ${cols} FROM upload_logs WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [clientId, limit]
  )) as UploadLog[];
}

async function columnExists(sql: ReturnType<typeof getSql>, table: string, column: string): Promise<boolean> {
  try {
    const rows = (await sql.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, column]
    )) as { 1?: number }[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function recordUpload(input: {
  clientId: string;
  uploadedBy: string | null;
  fileName: string | null;
  rows: number;
  staged: number;
  skipped: number;
  failed: number;
  dataHealth: number;
  status: string;
  documentType?: string;
}): Promise<UploadLog> {
  const sql = getSql();

  // Check if document_type column exists
  const hasDocType = await columnExists(sql, 'upload_logs', 'document_type');

  if (hasDocType && input.documentType) {
    const results = (await sql.query(
      `INSERT INTO upload_logs
         (client_id, uploaded_by, file_name, document_type, rows, staged, skipped, failed, data_health, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        input.clientId,
        input.uploadedBy,
        input.fileName,
        input.documentType,
        input.rows,
        input.staged,
        input.skipped,
        input.failed,
        input.dataHealth,
        input.status,
      ]
    )) as UploadLog[];
    return results[0];
  }

  const results = (await sql.query(
    `INSERT INTO upload_logs
       (client_id, uploaded_by, file_name, rows, staged, skipped, failed, data_health, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      input.clientId,
      input.uploadedBy,
      input.fileName,
      input.rows,
      input.staged,
      input.skipped,
      input.failed,
      input.dataHealth,
      input.status,
    ]
  )) as UploadLog[];
  return results[0];
}
