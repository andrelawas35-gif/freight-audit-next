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
  rows: number;
  staged: number;
  skipped: number;
  failed: number;
  data_health: number;
  status: string;
};

export async function listUploads(clientId: string, limit = 20): Promise<UploadLog[]> {
  const sql = getSql();
  return (await sql.query(
    'SELECT * FROM upload_logs WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2',
    [clientId, limit]
  )) as UploadLog[];
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
}): Promise<UploadLog> {
  const sql = getSql();
  const rows = (await sql.query(
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
  return rows[0];
}
