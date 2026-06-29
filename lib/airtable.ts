/*
  lib/airtable.ts - re-export shim.
  All data-access logic now lives at lib/db/records.ts.
  See the BACKLOG item "Rename lib/airtable.ts" for migration status.
*/
export {
  fetchRecords,
  fetchRecord,
  createRecord,
  updateRecord,
  batchCreate,
  fetchAllRecords,
  softDelete,
  restoreRecord,
} from '@/lib/db/records';
export type { TableName, RecordQueryOptions } from '@/lib/db/records';