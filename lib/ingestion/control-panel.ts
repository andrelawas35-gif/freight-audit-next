import { fetchRecords } from '@/lib/airtable';
import { getSql } from '@/lib/db';
import { listExceptions } from '@/lib/ingestion/mappings';
import { getCycleSummaries, listFulfillmentLines } from '@/lib/ingestion/3pl/stage';
import { listJobs } from '@/lib/audit/jobs';
import type { AuditResult, Carrier, Client, Invoice, Shipment } from '@/lib/types';

export type ControlPanelData = Awaited<ReturnType<typeof getIngestionControlPanelData>>;

type UploadLogRow = {
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

type SftpFileRow = {
  id: string;
  carrier_scac: string;
  file_name: string;
  file_size: number | null;
  files_staged: number;
  errors: string[];
  processed_at: string;
};

type StorageSummaryRow = {
  client_id: string | null;
  invoice_cycle: string | null;
  lines: number;
  audited: number;
  billed: number;
};

type IngestionEvent = {
  id: string;
  source: string;
  client: string;
  carrier: string;
  file: string;
  rows: number;
  staged: number;
  exceptions: number;
  status: string;
  at: string;
};

export async function getIngestionControlPanelData() {
  const [
    invoicesRaw,
    shipmentsRaw,
    auditsRaw,
    disputesRaw,
    clientsRaw,
    carriersRaw,
    exceptions,
    jobs,
    uploads,
    sftpFiles,
    tplCycles,
    tplLines,
    storageCycles,
  ] = await Promise.all([
    fetchRecords('Invoices', { maxRecords: 1000 }),
    fetchRecords('Shipments', { maxRecords: 1000 }),
    fetchRecords('Audit Results', {
      maxRecords: 1000,
      fields: ['Invoice', 'Outcome', 'Review status', 'Client', 'Carrier SCAC', 'Invoice number'],
    }),
    fetchRecords('Disputes', {
      maxRecords: 500,
      fields: ['Audit result', 'Invoice', 'Client', 'Status', 'Disputed amount', 'Carrier (display)'],
    }),
    fetchRecords('Clients', { maxRecords: 500, fields: ['Company name'] }),
    fetchRecords('Carriers', { maxRecords: 500, fields: ['Carrier name', 'SCAC'] }),
    safeRead(() => listExceptions('open', 500), []),
    safeRead(() => listJobs(20), []),
    safeRead(() => listRecentUploads(20), []),
    safeRead(() => listRecentSftpFiles(20), []),
    safeRead(() => getCycleSummaries(20), []),
    safeRead(() => listFulfillmentLines(30), []),
    safeRead(() => listStorageSummaries(20), []),
  ]);

  const invoices = invoicesRaw as Invoice[];
  const shipments = shipmentsRaw as Shipment[];
  const audits = auditsRaw as AuditResult[];
  const clients = clientsRaw as Client[];
  const carriers = carriersRaw as Carrier[];

  const clientNames = new Map(clients.map((client) => [client.id, client['Company name'] || client.id]));
  const carrierNamesById = new Map(
    carriers.map((carrier) => [
      carrier.id,
      carrier['SCAC']
        ? `${carrier['SCAC']} ${carrier['Carrier name'] ? '- ' + carrier['Carrier name'] : ''}`.trim()
        : carrier['Carrier name'] || carrier.id,
    ])
  );

  const auditedInvoiceIds = new Set(audits.flatMap((audit) => audit.Invoice ?? []));
  const disputedAuditIds = new Set(
    (disputesRaw as { 'Audit result'?: string[] }[]).flatMap((dispute) => dispute['Audit result'] ?? [])
  );
  const referencedShipmentIds = new Set(invoices.flatMap((invoice) => invoice.Shipment ?? []));

  const matchedInvoices = invoices.filter((invoice) => (invoice.Shipment ?? []).length > 0);
  const unmatchedInvoices = invoices.filter((invoice) => (invoice.Shipment ?? []).length === 0);
  const auditedInvoices = invoices.filter((invoice) => auditedInvoiceIds.has(invoice.id));
  const unauditedInvoices = invoices.filter((invoice) => !auditedInvoiceIds.has(invoice.id));
  const unlinkedShipments = shipments.filter((shipment) => !referencedShipmentIds.has(shipment.id));
  const flaggedFindings = audits.filter((audit) => audit.Outcome === 'FLAGGED' || audit.Outcome === 'ERROR');
  const findingsInDispute = flaggedFindings.filter((audit) => disputedAuditIds.has(audit.id));
  const queuedJobs = jobs.filter((job) => job.status === 'queued' || job.status === 'running');

  const recentEvents: IngestionEvent[] = [
    ...uploads.map((upload) => ({
      id: upload.id,
      source: 'WMS upload',
      client: clientNames.get(upload.client_id || '') || upload.client_id || 'Unknown',
      carrier: '-',
      file: upload.file_name || '-',
      rows: upload.rows,
      staged: upload.staged,
      exceptions: upload.failed + upload.skipped,
      status: upload.status,
      at: upload.created_at,
    })),
    ...sftpFiles.map((file) => ({
      id: file.id,
      source: 'SFTP fetch',
      client: 'Resolved by invoice',
      carrier: file.carrier_scac,
      file: file.file_name,
      rows: file.files_staged,
      staged: file.files_staged,
      exceptions: file.errors?.length ?? 0,
      status: file.errors?.length ? 'partial' : 'ok',
      at: file.processed_at,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 20);

  const recentInvoices = invoices.slice(0, 25).map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice['Invoice number'] || invoice.id.slice(0, 10),
    client: formatFirstLinkedName(invoice.Clients, clientNames),
    carrier: formatCarrier(invoice.Carrier, carrierNamesById),
    amount: invoice['Amount billed'] || 0,
    date: invoice['Invoice date'] || null,
    matched: (invoice.Shipment ?? []).length > 0,
    audited: auditedInvoiceIds.has(invoice.id),
  }));

  return {
    clients: clients
      .map((client) => ({ id: client.id, name: client['Company name'] || client.id }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    metrics: {
      invoices: invoices.length,
      matched: matchedInvoices.length,
      audited: auditedInvoices.length,
      exceptions: exceptions.length,
      queuedJobs: queuedJobs.length,
      tplUnmatched: tplCycles.reduce((sum, cycle) => sum + cycle.unmatched, 0),
      unlinkedShipments: unlinkedShipments.length,
      findings: flaggedFindings.length,
      findingsInDispute: findingsInDispute.length,
      uploads: uploads.length,
      sftpFiles: sftpFiles.length,
    },
    intake: {
      events: recentEvents,
      uploads,
      sftpFiles,
    },
    work: {
      unmatchedInvoices: unmatchedInvoices.slice(0, 20),
      unlinkedShipments: unlinkedShipments.slice(0, 20),
      exceptions: exceptions.slice(0, 10),
      unauditedInvoices: unauditedInvoices.slice(0, 20),
    },
    audit: {
      jobs,
      recentInvoices,
    },
    tpl: {
      cycles: tplCycles,
      recentLines: tplLines,
      storageCycles,
    },
  };
}

async function listRecentUploads(limit: number): Promise<UploadLogRow[]> {
  const sql = getSql();
  return (await sql.query(
    'SELECT * FROM upload_logs ORDER BY created_at DESC LIMIT $1',
    [limit]
  )) as UploadLogRow[];
}

async function listRecentSftpFiles(limit: number): Promise<SftpFileRow[]> {
  const sql = getSql();
  return (await sql.query(
    'SELECT * FROM sftp_processed_files ORDER BY processed_at DESC LIMIT $1',
    [limit]
  )) as SftpFileRow[];
}

async function listStorageSummaries(limit: number): Promise<StorageSummaryRow[]> {
  const sql = getSql();
  return (await sql.query(
    `SELECT client_id, invoice_cycle,
            count(*)::int AS lines,
            count(*) FILTER (WHERE audit_status = 'audited')::int AS audited,
            coalesce(sum(billed_amount), 0) AS billed
       FROM tpl_storage_lines
       GROUP BY client_id, invoice_cycle
       ORDER BY max(created_at) DESC
       LIMIT $1`,
    [limit]
  )) as StorageSummaryRow[];
}

function formatFirstLinkedName(ids: string[] | undefined, names: Map<string, string>) {
  const id = ids?.[0];
  return id ? names.get(id) || id : 'Unassigned';
}

function formatCarrier(value: unknown, names: Map<string, string>) {
  if (Array.isArray(value)) {
    const id = value[0];
    return id ? names.get(id) || id : 'Unknown';
  }
  if (typeof value === 'string' && value) {
    return names.get(value) || value;
  }
  return 'Unknown';
}

async function safeRead<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('does not exist')) return fallback;
    throw err;
  }
}
