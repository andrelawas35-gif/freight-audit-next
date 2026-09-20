/*
  lib/portal/upload-router.ts — routes uploads by document type.

  Server-only. Called from server actions, not a 'use server' directive itself.
  For shipment CSVs, delegates to existing uploadShipments.
  For document types (insurance, contract, SOP, claims), stores metadata and returns acknowledgment.
*/

import { getSql } from '@/lib/db';

export const DOCUMENT_TYPES = [
  'shipment_csv',
  'insurance_policy',
  'carrier_contract',
  'sop',
  'claims_history',
] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  shipment_csv: 'Shipment CSV',
  insurance_policy: 'Insurance Policy',
  carrier_contract: 'Carrier Contract',
  sop: 'SOP',
  claims_history: 'Claims History',
};

export function getPipelineMessage(type: DocumentType): string {
  switch (type) {
    case 'insurance_policy':
      return 'Will be routed to AI extraction for rule identification.';
    case 'carrier_contract':
      return 'Will be routed to AI extraction for clause identification.';
    case 'sop':
      return 'Will be routed to AI extraction for procedure mapping.';
    case 'claims_history':
      return 'Will be indexed as dispute evidence.';
    default:
      return 'Document uploaded successfully.';
  }
}

export async function recordDocumentUpload(input: {
  clientId: string;
  uploadedBy: string | null;
  fileName: string | null;
  documentType: DocumentType;
}): Promise<{ id: string }> {
  const sql = getSql();
  const id = `upl${crypto.randomUUID().replace(/-/g, '')}`;
  await sql.query(
    `INSERT INTO upload_logs
       (id, client_id, uploaded_by, file_name, rows, staged, skipped, failed, data_health, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, input.clientId, input.uploadedBy, input.fileName, 0, 0, 0, 0, '0', 'document']
  );
  return { id };
}
