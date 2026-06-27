import {
  pgTable,
  text,
  numeric,
  boolean,
  integer,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── ID generators (match existing Neon defaults) ─────────────────
const recId = sql`'rec' || replace(gen_random_uuid()::text, '-', '')`;
const usrId = sql`'usr' || replace(gen_random_uuid()::text, '-', '')`;
const runId = sql`'run' || replace(gen_random_uuid()::text, '-', '')`;
const doId  = sql`'do'  || replace(gen_random_uuid()::text, '-', '')`;
const excId = sql`'exc' || replace(gen_random_uuid()::text, '-', '')`;
const lmId  = sql`'lm'  || replace(gen_random_uuid()::text, '-', '')`;
const rbId  = sql`'rb'  || replace(gen_random_uuid()::text, '-', '')`;
const tplfId = sql`'tplf' || replace(gen_random_uuid()::text, '-', '')`;
const tplsId = sql`'tpls' || replace(gen_random_uuid()::text, '-', '')`;
const uplId  = sql`'upl' || replace(gen_random_uuid()::text, '-', '')`;
const jobId  = sql`'job' || replace(gen_random_uuid()::text, '-', '')`;
const sfId   = sql`'sf'  || replace(gen_random_uuid()::text, '-', '')`;
const gbtId  = sql`'gbt' || replace(gen_random_uuid()::text, '-', '')`;
const polId  = sql`'pol' || replace(gen_random_uuid()::text, '-', '')`;
const iprId  = sql`'ipr' || replace(gen_random_uuid()::text, '-', '')`;
const iarId  = sql`'iar' || replace(gen_random_uuid()::text, '-', '')`;
const cpId   = sql`'cp'  || replace(gen_random_uuid()::text, '-', '')`;
const pdocId = sql`'pdoc' || replace(gen_random_uuid()::text, '-', '')`;
const prsId  = sql`'prs' || replace(gen_random_uuid()::text, '-', '')`;
const prId   = sql`'pr'  || replace(gen_random_uuid()::text, '-', '')`;
const pbtId  = sql`'pbt' || replace(gen_random_uuid()::text, '-', '')`;
const pbrId  = sql`'pbr' || replace(gen_random_uuid()::text, '-', '')`;
const graId  = sql`'gra' || replace(gen_random_uuid()::text, '-', '')`;
const gdId   = sql`'gd'  || replace(gen_random_uuid()::text, '-', '')`;
const ptcId  = sql`'ptc' || replace(gen_random_uuid()::text, '-', '')`;
const ceId   = sql`'ce_' || replace(gen_random_uuid()::text, '-', '')`;
const atId   = sql`'at'  || replace(gen_random_uuid()::text, '-', '')`;
const ibId   = sql`'ib'  || replace(gen_random_uuid()::text, '-', '')`;
const irId   = sql`'ir'  || replace(gen_random_uuid()::text, '-', '')`;
const pseId  = sql`'pse' || replace(gen_random_uuid()::text, '-', '')`;
const txcId  = sql`'txc' || replace(gen_random_uuid()::text, '-', '')`;

// ── Business tables (quoted names from Airtable legacy) ──────────

export const invoices = pgTable('Invoices', {
  id:              text('id').primaryKey().default(recId),
  invoiceNumber:   text('Invoice number'),
  status:          text('Status'),
  amountBilled:    numeric('Amount billed'),
  amountApproved:  numeric('Amount approved'),
  amountDisputed:  numeric('Amount disputed'),
  shipment:        text('Shipment').array(),
  carrier:         text('Carrier').array(),
  invoiceDate:     text('Invoice date'),
  paymentDueDate:  text('Payment due date'),
  clients:         text('Clients').array(),
  clientId:        text('client_id'),
  createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
  deletedAt:       timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_invoice_number').on(t.invoiceNumber),
  index('idx_invoice_clients_gin').using('gin', t.clients),
  index('idx_invoices_client_id').on(t.clientId),
]);

export const shipments = pgTable('Shipments', {
  id:                    text('id').primaryKey().default(recId),
  proNumber:             text('PRO number'),
  trackingNumber:        text('Tracking number'),
  actualL:               numeric('Actual L'),
  actualW:               numeric('Actual W'),
  actualH:               numeric('Actual H'),
  actualWeightLbs:       numeric('Actual weight lbs'),
  shipDate:              text('Ship date'),
  deliveryDate:          text('Delivery date'),
  serviceLevel:          text('Service level'),
  carrier:               text('Carrier'),
  destinationZip:        text('Destination zip'),
  addressClassification: text('Address classification'),
  createdAt:             timestamp('created_at', { withTimezone: true }).defaultNow(),
  deletedAt:             timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_shipment_pro').on(t.proNumber),
  index('idx_shipment_tracking').on(t.trackingNumber),
]);

export const auditResults = pgTable('Audit Results', {
  id:               text('id').primaryKey().default(recId),
  invoice:          text('Invoice').array(),
  invoiceLine:      text('Invoice line').array(),
  auditRules:       text('Audit Rules').array(),
  outcome:          text('Outcome'),
  expectedAmount:   numeric('Expected amount'),
  billedAmount:     numeric('Billed amount'),
  variance:         numeric('Variance'),
  notes:            text('Notes'),
  auditedAt:        text('Audited at'),
  detectedBy:       text('Detected by'),
  disputes:         text('Disputes').array(),
  reviewStatus:     text('Review status'),
  client:           text('Client').array(),
  clientId:         text('client_id'),
  shipmentId:       text('shipment_id'),
  carrierScac:      text('Carrier SCAC'),
  carrierDisplay:   text('Carrier (display)'),
  carrier:          text('Carrier'),
  invoiceNumber:    text('Invoice number'),
  trackingNumber:   text('Tracking number'),
  recoverableAmount: numeric('Recoverable amount'),
  recoverAmount:    numeric('Recover amount'),
  ruleName:         text('Rule name'),
  rule:             text('Rule'),
  gatewayPreventability: text('Gateway preventability'),
  gatewayCategory:  text('Gateway category'),
  gatewayRuleSuggestion: text('Gateway rule suggestion'),
  gatewayEstimatedSavings: numeric('Gateway estimated savings'),
  gatewayConfidence: numeric('Gateway confidence'),
  gatewaySignalSource: text('Gateway signal source'),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
  deletedAt:        timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_audit_outcome').on(t.outcome),
  index('idx_audit_invoice_gin').using('gin', t.invoice),
  index('idx_audit_client_gin').using('gin', t.client),
  index('idx_audit_gateway').on(t.gatewayPreventability, t.gatewayCategory),
  index('idx_audit_results_client_id').on(t.clientId),
  index('idx_audit_results_shipment_id').on(t.shipmentId),
]);

export const disputes = pgTable('Disputes', {
  id:                text('id').primaryKey().default(recId),
  disputeId:         text('Dispute ID'),
  invoice:           text('Invoice').array(),
  auditResult:       text('Audit result').array(),
  client:            text('Client').array(),
  clientId:          text('client_id'),
  auditRule:         text('Audit rule').array(),
  carrierDisplay:    text('Carrier (display)'),
  carrier:           text('Carrier'),
  trackingNumber:    text('Tracking number'),
  disputedAmount:    numeric('Disputed amount'),
  status:            text('Status'),
  openedDate:        text('Opened date'),
  filedDate:         text('Filed date'),
  carrierResponseDate: text('Carrier response date'),
  escalationDate:    text('Escalation date'),
  escalationReason:  text('Escalation reason'),
  dateResolved:      text('Date resolved'),
  recoveryAmount:    numeric('Recovery amount'),
  resolutionNotes:   text('Resolution notes'),
  createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow(),
  deletedAt:         timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_dispute_status').on(t.status),
  index('idx_disputes_client_id').on(t.clientId),
]);

export const clients = pgTable('Clients', {
  id:                  text('id').primaryKey().default(recId),
  companyName:         text('Company name'),
  contractActive:      boolean('Contract active'),
  gainSharePct:        numeric('Gain share pct'),
  minInvoiceThreshold: numeric('Min invoice threshold'),
  lastAuditRun:        text('Last audit run'),
  createdAt:           timestamp('created_at', { withTimezone: true }).defaultNow(),
  deletedAt:           timestamp('deleted_at', { withTimezone: true }),
});

export const carriers = pgTable('Carriers', {
  id:           text('id').primaryKey().default(recId),
  scac:         text('SCAC'),
  carrierName:  text('Carrier name'),
  carrierType:  text('Carrier type'),
  contactEmail: text('Contact email'),
  sftpHost:     text('sftp_host'),
  sftpPort:     integer('sftp_port'),
  sftpUser:     text('sftp_user'),
  sftpKeyEnv:   text('sftp_key_env'),
  sftpInboxDir: text('sftp_inbox_dir'),
  sftpArchiveDir: text('sftp_archive_dir'),
  sftpFileFormat: text('sftp_file_format'),
  sftpEnabled:  boolean('sftp_enabled').notNull().default(false),
  createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
  deletedAt:     timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_carrier_scac').on(t.scac),
]);

export const carrierCodes = pgTable('Carrier Codes', {
  id:              text('id').primaryKey().default(recId),
  scacCode:        text('SCAC code'),
  carrierScac:     text('Carrier SCAC'),
  filingWindowDays: numeric('Filing window days'),
});

// ── Platform tables (snake_case) ─────────────────────────────────

export const appUsers = pgTable('app_users', {
  id:           text('id').primaryKey().default(usrId),
  email:        text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name:         text('name'),
  role:         text('role').notNull().default('client'),
  clientId:         text('client_id'),
  isTaxonomyAdmin:  boolean('is_taxonomy_admin').notNull().default(false),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('app_users_email_key').on(t.email),
  index('idx_app_users_email').on(t.email),
]);

export const auditRuns = pgTable('audit_runs', {
  id:              text('id').primaryKey().default(runId),
  startedAt:       timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt:      timestamp('finished_at', { withTimezone: true }),
  clientId:        text('client_id'),
  clientName:      text('client_name'),
  dryRun:          boolean('dry_run').notNull().default(false),
  status:          text('status').notNull().default('running'),
  invoicesChecked: integer('invoices_checked').notNull().default(0),
  findingsCreated: integer('findings_created').notNull().default(0),
  totalVariance:   numeric('total_variance').notNull().default('0'),
  errors:          text('errors').array().notNull().default(sql`'{}'::text[]`),
  triggeredBy:     text('triggered_by'),
}, (t) => [
  index('idx_audit_runs_started').on(t.startedAt),
]);

export const rulebook = pgTable('rulebook', {
  id:            text('id').primaryKey().default(rbId),
  scope:         text('scope').notNull(),
  clientId:      text('client_id'),
  carrierScac:   text('carrier_scac'),
  serviceLevel:  text('service_level'),
  ruleKey:       text('rule_key').notNull(),
  numValue:      numeric('num_value'),
  boolValue:     boolean('bool_value'),
  textValue:     text('text_value'),
  effectiveFrom: date('effective_from'),
  effectiveTo:   date('effective_to'),
  note:          text('note'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:     timestamp('deleted_at', { withTimezone: true }),
  clauseRef:     text('clause_ref'),
}, (t) => [
  index('idx_rulebook_key').on(t.ruleKey),
  uniqueIndex('uq_rulebook_scope').on(
    t.scope,
    sql`COALESCE(${t.clientId}, '')`,
    sql`COALESCE(${t.carrierScac}, '')`,
    sql`COALESCE(${t.serviceLevel}, '')`,
    t.ruleKey,
    sql`COALESCE(${t.effectiveFrom}, '1900-01-01'::date)`,
  ),
]);

export const learnedMappings = pgTable('learned_mappings', {
  id:           text('id').primaryKey().default(lmId),
  mappingType:  text('mapping_type').notNull(),
  carrierScac:  text('carrier_scac'),
  rawCode:      text('raw_code').notNull(),
  standardCode: text('standard_code').notNull(),
  author:       text('author').notNull().default('HUMAN_ANALYST'),
  confidence:   numeric('confidence'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_learned_mapping').on(
    t.mappingType,
    sql`COALESCE(${t.carrierScac}, '')`,
    sql`upper(${t.rawCode})`,
  ),
]);

export const ingestionExceptions = pgTable('ingestion_exceptions', {
  id:                   text('id').primaryKey().default(excId),
  mappingType:          text('mapping_type').notNull(),
  carrierScac:          text('carrier_scac'),
  rawCode:              text('raw_code').notNull(),
  source:               text('source'),
  sample:               jsonb('sample'),
  suggestedCode:        text('suggested_code'),
  reasoning:            text('reasoning'),
  occurrences:          integer('occurrences').notNull().default(1),
  status:               text('status').notNull().default('open'),
  resolvedBy:           text('resolved_by'),
  resolvedAt:           timestamp('resolved_at', { withTimezone: true }),
  learnedMappingId:     text('learned_mapping_id'),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  suggestedConfidence:  numeric('suggested_confidence'),
}, (t) => [
  index('idx_exc_status').on(t.status, t.createdAt),
  index('idx_exc_dedup').on(
    t.mappingType,
    sql`COALESCE(${t.carrierScac}, '')`,
    sql`upper(${t.rawCode})`,
    t.status,
  ),
]);

// ── Ingestion lineage ──────────────────────────────────────────
// Tracks every intake event so we can trace any staged record back to its source.

export const ingestionBatches = pgTable('ingestion_batches', {
  id:           text('id').primaryKey().default(ibId),
  source:       text('source').notNull(),          // SFTP | API | WEBHOOK | CONSOLE_UPLOAD | CONSOLE_PASTE
  carrierScac:  text('carrier_scac'),
  clientId:     text('client_id'),
  fileName:     text('file_name'),                  // original filename or API endpoint
  fileSize:     integer('file_size'),
  rowCount:     integer('row_count'),               // raw payload items
  stagedCount:  integer('staged_count'),            // successfully staged
  errorCount:   integer('error_count'),             // failed to stage
  status:       text('status').notNull().default('processing'),  // processing | completed | partial | failed
  metadata:     jsonb('metadata'),                  // correlation ids, SFTP job id, etc.
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deleted_at:   timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_ib_created_at').on(t.createdAt),
  index('idx_ib_source_client').on(t.source, t.clientId, t.createdAt),
]);

export const ingestionRecords = pgTable('ingestion_records', {
  id:              text('id').primaryKey().default(irId),
  batchId:         text('batch_id').notNull().references(() => ingestionBatches.id),
  rawPayload:      jsonb('raw_payload'),            // the original incoming data
  normalizedType:  text('normalized_type'),          // invoice | shipment | fulfillment | storage
  stagedRecordId:  text('staged_record_id'),        // id in Invoices | Shipments | 3PL tables
  auditResultId:   text('audit_result_id'),         // later audit finding (if any)
  disputeId:       text('dispute_id'),               // later dispute (if any)
  status:          text('status').notNull().default('staged'),  // staged | audited | disputed
  errors:          jsonb('errors'),                  // validation or staging errors
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deleted_at:      timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_ir_batch_id').on(t.batchId, t.createdAt),
  index('idx_ir_staged').on(t.stagedRecordId),
  index('idx_ir_audit').on(t.auditResultId),
]);

export const disputeOutcomes = pgTable('dispute_outcomes', {
  id:              text('id').primaryKey().default(doId),
  disputeId:       text('dispute_id').notNull(),
  outcome:         text('outcome').notNull(),
  recoveryAmount:  numeric('recovery_amount'),
  confidence:      numeric('confidence'),
  reasoning:       text('reasoning'),
  sourceText:      text('source_text'),
  appliedBy:       text('applied_by'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  ruleCode:        text('rule_code'),
  carrierScac:     text('carrier_scac'),
  disputedAmount:  numeric('disputed_amount'),
}, (t) => [
  index('idx_dispute_outcomes_dispute').on(t.disputeId, t.createdAt),
]);

export const uploadLogs = pgTable('upload_logs', {
  id:         text('id').primaryKey().default(uplId),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  clientId:   text('client_id'),
  uploadedBy: text('uploaded_by'),
  fileName:   text('file_name'),
  rows:       integer('rows').notNull().default(0),
  staged:     integer('staged').notNull().default(0),
  skipped:    integer('skipped').notNull().default(0),
  failed:     integer('failed').notNull().default(0),
  dataHealth: numeric('data_health').notNull().default('0'),
  status:     text('status').notNull().default('ok'),
}, (t) => [
  index('idx_upload_logs_client').on(t.clientId, t.createdAt),
]);

export const tplFulfillmentLines = pgTable('tpl_fulfillment_lines', {
  id:                text('id').primaryKey().default(tplfId),
  clientId:          text('client_id'),
  carrierScac:       text('carrier_scac'),
  invoiceCycle:      text('invoice_cycle'),
  orderId:           text('order_id'),
  wmsShipmentId:     text('wms_shipment_id'),
  trackingNumber:    text('tracking_number'),
  unitsPicked:       integer('units_picked'),
  basePickFee:       numeric('base_pick_fee'),
  additionalPickFee: numeric('additional_pick_fee'),
  packagingFee:      numeric('packaging_fee'),
  billedDims:        text('billed_dims'),
  billedWeight:      numeric('billed_weight'),
  baseFreight:       numeric('base_freight'),
  fuelSurcharge:     numeric('fuel_surcharge'),
  accessorials:      jsonb('accessorials'),
  totalBilled:       numeric('total_billed'),
  matchStatus:       text('match_status').notNull().default('unmatched'),
  matchedShipmentId: text('matched_shipment_id'),
  raw:               jsonb('raw'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  carrierPro:        text('carrier_pro'),
  baseCarrierCost:   numeric('base_carrier_cost'),
  auditStatus:       text('audit_status').notNull().default('pending'),
}, (t) => [
  index('idx_tplf_audit').on(t.auditStatus),
  index('idx_tplf_cycle').on(t.clientId, t.invoiceCycle, t.createdAt),
  index('idx_tplf_match').on(t.matchStatus),
  index('idx_tplf_pending_scan').on(t.auditStatus, t.clientId, t.invoiceCycle, t.id),
]);

export const tplStorageLines = pgTable('tpl_storage_lines', {
  id:           text('id').primaryKey().default(tplsId),
  clientId:     text('client_id'),
  invoiceCycle: text('invoice_cycle'),
  sku:          text('sku'),
  storageType:  text('storage_type'),
  qtyOnHand:    integer('qty_on_hand'),
  cubicVolume:  numeric('cubic_volume'),
  locationId:   text('location_id'),
  billedAmount: numeric('billed_amount'),
  raw:          jsonb('raw'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  auditStatus:  text('audit_status').notNull().default('pending'),
}, (t) => [
  index('idx_tpls_audit').on(t.auditStatus),
  index('idx_tpls_cycle').on(t.clientId, t.invoiceCycle, t.createdAt),
  index('idx_tpls_pending_scan').on(t.auditStatus, t.clientId, t.invoiceCycle, t.id),
]);

// ── Job queue ────────────────────────────────────────────────

export const auditJobs = pgTable('audit_jobs', {
  id:          text('id').primaryKey().default(jobId),
  jobType:     text('job_type').notNull().default('parcel'),
  clientId:    text('client_id'),
  dryRun:      boolean('dry_run').notNull().default(false),
  status:      text('status').notNull().default('queued'),
  queuedAt:    timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt:   timestamp('started_at', { withTimezone: true }),
  finishedAt:  timestamp('finished_at', { withTimezone: true }),
  runId:       text('run_id'),
  result:      jsonb('result'),
  error:       text('error'),
  triggeredBy: text('triggered_by'),
  cycle:       text('cycle'),
}, (t) => [
  index('idx_audit_jobs_status').on(t.status, t.queuedAt),
  index('idx_audit_jobs_client').on(t.clientId, t.status),
]);

// ── SFTP file tracking ─────────────────────────────────────────

export const sftpProcessedFiles = pgTable('sftp_processed_files', {
  id:          text('id').primaryKey().default(sfId),
  carrierScac: text('carrier_scac').notNull(),
  fileName:    text('file_name').notNull(),
  fileSize:    integer('file_size'),
  filesStaged: integer('files_staged').notNull().default(0),
  errors:      text('errors').array().notNull().default(sql`'{}'::text[]`),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_sftp_file').on(t.carrierScac, t.fileName),
  index('idx_sftp_processed_at').on(t.processedAt),
]);

// Gateway readiness and high-value insurance intelligence

// ── Audit trail ─────────────────────────────────────────────────
// App-level mutation logging: who did what to which record when.
// Wired into createRecord / updateRecord / softDelete in lib/db/records.ts.

export const auditTrail = pgTable('audit_trail', {
  id:            text('id').primaryKey().default(atId),
  actor:         text('actor'),                       // session email / system / ingest key
  tableName:     text('table_name').notNull(),
  recordId:      text('record_id').notNull(),
  action:        text('action').notNull(),             // INSERT | UPDATE | DELETE (soft)
  changedFields: jsonb('changed_fields'),              // {col: {from, to}} — only changed columns
  changedAt:     timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  metadata:      jsonb('metadata'),                    // correlation ids, source, etc.
}, (t) => [
  index('idx_audit_trail_table_record').on(t.tableName, t.recordId, t.changedAt),
  index('idx_audit_trail_changed_at').on(t.changedAt),
  index('idx_audit_trail_actor').on(t.actor, t.changedAt),
]);

export const gatewayBehavioralTags = pgTable('gateway_behavioral_tags', {
  id:                     text('id').primaryKey().default(gbtId),
  auditResultId:          text('audit_result_id').notNull(),
  clientId:               text('client_id'),
  carrierScac:            text('carrier_scac'),
  invoiceId:              text('invoice_id'),
  shipmentId:             text('shipment_id'),
  ruleCode:               text('rule_code'),
  gatewayPreventability:  text('gateway_preventability').notNull(),
  gatewayCategory:        text('gateway_category').notNull(),
  ruleSuggestion:         text('rule_suggestion'),
  estimatedSavings:       numeric('estimated_savings').notNull().default('0'),
  confidence:             numeric('confidence').notNull().default('0'),
  signalSource:           text('signal_source').notNull().default('RULE_DEFAULT'),
  reviewStatus:           text('review_status').notNull().default('pending'),
  createdAt:              timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedBy:             text('reviewed_by'),
  reviewedAt:             timestamp('reviewed_at', { withTimezone: true }),
}, (t) => [
  index('idx_gateway_tags_client').on(t.clientId, t.createdAt),
  index('idx_gateway_tags_taxonomy').on(t.gatewayPreventability, t.gatewayCategory),
  index('idx_gateway_tags_audit').on(t.auditResultId),
]);

export const clientInsurancePolicies = pgTable('client_insurance_policies', {
  id:                               text('id').primaryKey().default(polId),
  clientId:                         text('client_id').notNull(),
  policyName:                       text('policy_name').notNull(),
  insurer:                          text('insurer'),
  broker:                           text('broker'),
  effectiveFrom:                    date('effective_from'),
  effectiveTo:                      date('effective_to'),
  maxCoveragePerShipment:           numeric('max_coverage_per_shipment'),
  maxCoveragePerDay:                numeric('max_coverage_per_day'),
  deductible:                       numeric('deductible'),
  coveredCommodities:               jsonb('covered_commodities'),
  excludedCommodities:              jsonb('excluded_commodities'),
  allowedCarriers:                  jsonb('allowed_carriers'),
  excludedCarriers:                 jsonb('excluded_carriers'),
  allowedServices:                  jsonb('allowed_services'),
  excludedServices:                 jsonb('excluded_services'),
  signatureRequiredAbove:           numeric('signature_required_above'),
  adultSignatureRequiredAbove:      numeric('adult_signature_required_above'),
  thirdPartyInsuranceRequiredAbove: numeric('third_party_insurance_required_above'),
  carrierDeclaredValueAllowed:      boolean('carrier_declared_value_allowed'),
  destinationExclusions:            jsonb('destination_exclusions'),
  highRiskZipRules:                 jsonb('high_risk_zip_rules'),
  internationalAllowed:             boolean('international_allowed'),
  claimWindowDays:                  integer('claim_window_days'),
  requiredDocuments:                jsonb('required_documents'),
  packagingRequirements:            jsonb('packaging_requirements'),
  shipperVerticals:                 jsonb('shipper_verticals'),
  temperatureControlRules:          jsonb('temperature_control_rules'),
  regulatedItemRules:               jsonb('regulated_item_rules'),
  appraisalRequiredAbove:           numeric('appraisal_required_above'),
  serialNumberRequired:             boolean('serial_number_required'),
  policyDocumentUrl:                text('policy_document_url'),
  notes:                            text('notes'),
  createdAt:                        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:                        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_insurance_policy_client').on(t.clientId, t.effectiveFrom, t.effectiveTo),
]);

export const insurancePolicyRules = pgTable('insurance_policy_rules', {
  id:            text('id').primaryKey().default(iprId),
  clientId:      text('client_id').notNull(),
  policyId:      text('policy_id').notNull(),
  ruleKey:       text('rule_key').notNull(),
  conditionJson: jsonb('condition_json').notNull(),
  actionJson:    jsonb('action_json').notNull(),
  severity:      text('severity').notNull().default('warn'),
  clauseRef:     text('clause_ref'),
  effectiveFrom: date('effective_from'),
  effectiveTo:   date('effective_to'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_insurance_rules_policy').on(t.policyId),
  index('idx_insurance_rules_client_key').on(t.clientId, t.ruleKey),
]);

export const shipmentInsuranceAuditResults = pgTable('shipment_insurance_audit_results', {
  id:                         text('id').primaryKey().default(iarId),
  clientId:                   text('client_id').notNull(),
  shipmentId:                 text('shipment_id'),
  auditResultId:              text('audit_result_id'),
  policyId:                   text('policy_id'),
  policyRuleId:               text('policy_rule_id'),
  shipperVertical:            text('shipper_vertical'),
  commodityType:              text('commodity_type'),
  insuranceRiskCategory:      text('insurance_risk_category').notNull(),
  gatewayPreventability:      text('gateway_preventability').notNull().default('UNKNOWN'),
  gatewayAction:              text('gateway_action').notNull().default('WARN'),
  insuranceRuleSuggestion:    text('insurance_rule_suggestion'),
  declaredValue:              numeric('declared_value').notNull().default('0'),
  replacementValue:           numeric('replacement_value'),
  insuredValue:               numeric('insured_value'),
  estimatedUninsuredExposure: numeric('estimated_uninsured_exposure').notNull().default('0'),
  destinationRiskTier:        text('destination_risk_tier'),
  documentationRequired:      jsonb('documentation_required'),
  documentationReceived:      jsonb('documentation_received'),
  clauseRef:                  text('clause_ref'),
  confidence:                 numeric('confidence').notNull().default('0'),
  createdAt:                  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_insurance_audit_client').on(t.clientId, t.createdAt),
  index('idx_insurance_audit_taxonomy').on(t.gatewayPreventability, t.insuranceRiskCategory),
  index('idx_insurance_audit_policy').on(t.policyId),
]);

export const clientPolicies = pgTable('client_policies', {
  id:            text('id').primaryKey().default(cpId),
  clientId:      text('client_id').notNull(),
  policyType:    text('policy_type').notNull(),
  name:          text('name').notNull(),
  owner:         text('owner'),
  effectiveFrom: date('effective_from'),
  effectiveTo:   date('effective_to'),
  status:        text('status').notNull().default('draft'),
  notes:         text('notes'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:     timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_client_policies_client').on(t.clientId, t.status, t.policyType),
  index('idx_client_policies_effective').on(t.effectiveFrom, t.effectiveTo),
]);

export const policyDocuments = pgTable('policy_documents', {
  id:               text('id').primaryKey().default(pdocId),
  clientId:         text('client_id').notNull(),
  policyId:         text('policy_id').notNull(),
  documentType:     text('document_type').notNull(),
  fileName:         text('file_name').notNull(),
  sourceUrl:        text('source_url'),
  effectiveFrom:    date('effective_from'),
  effectiveTo:      date('effective_to'),
  extractionStatus: text('extraction_status').notNull().default('not_started'),
  rawText:          text('raw_text'),
  summary:          text('summary'),
  uploadedBy:       text('uploaded_by'),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:        timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_policy_documents_policy').on(t.policyId, t.extractionStatus),
  index('idx_policy_documents_client').on(t.clientId, t.createdAt),
]);

export const policyRulesets = pgTable('policy_rulesets', {
  id:             text('id').primaryKey().default(prsId),
  clientId:       text('client_id').notNull(),
  version:        text('version').notNull(),
  status:         text('status').notNull().default('draft'),
  effectiveFrom:  date('effective_from'),
  effectiveTo:    date('effective_to'),
  createdBy:      text('created_by'),
  reviewedBy:     text('reviewed_by'),
  activatedAt:    timestamp('activated_at', { withTimezone: true }),
  archivedAt:     timestamp('archived_at', { withTimezone: true }),
  attestedBy:     text('attested_by'),
  attestedAt:     timestamp('attested_at', { withTimezone: true }),
  scopeStatement: text('scope_statement'),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:      timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('uq_policy_ruleset_client_version').on(t.clientId, t.version),
  index('idx_policy_rulesets_client').on(t.clientId, t.status),
]);

export const policyRules = pgTable('policy_rules', {
  id:            text('id').primaryKey().default(prId),
  clientId:      text('client_id').notNull(),
  rulesetId:     text('ruleset_id').notNull(),
  policyId:      text('policy_id'),
  documentId:    text('document_id'),
  ruleKey:       text('rule_key').notNull(),
  category:      text('category').notNull(),
  conditionJson: jsonb('condition_json').notNull(),
  actionJson:    jsonb('action_json').notNull(),
  severity:      text('severity').notNull().default('warn'),
  clauseRef:     text('clause_ref'),
  status:        text('status').notNull().default('draft'),
  signalSource:  text('signal_source'),
  sourceClauseText: text('source_clause_text'),
  confidence:    numeric('confidence'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:     timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_policy_rules_ruleset').on(t.rulesetId, t.status),
  index('idx_policy_rules_client_key').on(t.clientId, t.ruleKey),
  index('idx_policy_rules_category').on(t.category),
]);

export const policyBacktestRuns = pgTable('policy_backtest_runs', {
  id:                      text('id').primaryKey().default(pbtId),
  clientId:                text('client_id').notNull(),
  rulesetId:               text('ruleset_id').notNull(),
  periodStart:             date('period_start').notNull(),
  periodEnd:               date('period_end').notNull(),
  status:                  text('status').notNull().default('queued'),
  shipmentsChecked:        integer('shipments_checked').notNull().default(0),
  violationsFound:         integer('violations_found').notNull().default(0),
  preventableMarginLoss:   numeric('preventable_margin_loss').notNull().default('0'),
  uninsuredExposure:       numeric('uninsured_exposure').notNull().default('0'),
  error:                   text('error'),
  createdAt:               timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt:             timestamp('completed_at', { withTimezone: true }),
}, (t) => [
  index('idx_policy_backtest_runs_client').on(t.clientId, t.createdAt),
  index('idx_policy_backtest_runs_ruleset').on(t.rulesetId, t.status),
]);

export const policyBacktestResults = pgTable('policy_backtest_results', {
  id:                 text('id').primaryKey().default(pbrId),
  backtestRunId:      text('backtest_run_id').notNull(),
  clientId:           text('client_id').notNull(),
  ruleId:             text('rule_id').notNull(),
  shipmentId:         text('shipment_id'),
  invoiceId:          text('invoice_id'),
  auditResultId:      text('audit_result_id'),
  decision:           text('decision').notNull(),
  category:           text('category').notNull(),
  message:            text('message').notNull(),
  suggestedFix:       text('suggested_fix'),
  clauseRef:          text('clause_ref'),
  preventableLoss:    numeric('preventable_loss').notNull().default('0'),
  uninsuredExposure:  numeric('uninsured_exposure').notNull().default('0'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_policy_backtest_results_run').on(t.backtestRunId),
  index('idx_policy_backtest_results_client').on(t.clientId, t.category),
  index('idx_policy_backtest_results_rule').on(t.ruleId),
]);

/** T3 Vector Memory Bank — cross-tenant clause embeddings (ADR 0012 D4). No client_id — clauses are language. */
export const clauseEmbeddings = pgTable('clause_embeddings', {
  id:                     text('id').primaryKey().default(ceId),
  clauseText:             text('clause_text').notNull(),
  embedding:              /* vector(1536) — stored as text for Drizzle compat; pgvector extension manages native type */ text('embedding'),
  classifiedRuleKey:      text('classified_rule_key').notNull(),
  classifiedConditionJson: jsonb('classified_condition_json').notNull(),
  classificationSource:   text('classification_source').notNull().default('tokenizer'),
  matchCount:             integer('match_count').notNull().default(1),
  firstSeenAt:            timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastMatchedAt:          timestamp('last_matched_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:              timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('uq_clause_embeddings_clause').on(t.clauseText, t.classifiedRuleKey),
  index('idx_clause_embeddings_match_count').on(t.matchCount.desc()),
]);

// ── Keystone Phase 0 tables (contracts-v1) ─────────────────────────

/** Tier-2: Forensic gateway decision log (08-gateway.md D6). RLS-protected. */
export const gatewayDecisions = pgTable('gateway_decisions', {
  id:                text('id').primaryKey().default(gdId),
  clientId:          text('client_id').notNull(),
  correlationId:     text('correlation_id').notNull(),
  requestJson:       jsonb('request_json'),
  decision:          text('decision').notNull(),
  enforced:          boolean('enforced').notNull().default(false),
  violations:        jsonb('violations'),
  rulesetVersion:    text('ruleset_version'),
  degraded:          boolean('degraded').notNull().default(false),
  rulesetSnapshotId: text('ruleset_snapshot_id'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_gateway_decisions_client').on(t.clientId, t.createdAt.desc()),
  index('idx_gateway_decisions_correlation').on(t.correlationId),
]);

/** Tier-0: Taxonomy discovery candidates (Phase 4, ADR 0011 D5-D6 / 07-schema-evolution.md).
 *  Records novel L3 policy variables detected by the extraction pipeline.
 *  Tier-0 structural metadata only — no client values. Dedup by rule_key. */
export const policyTaxonomyCandidates = pgTable('policy_taxonomy_candidates', {
  id:                 text('id').primaryKey().default(ptcId),
  ruleKey:            text('rule_key').notNull(),
  inferredType:       text('inferred_type').notNull().default('string'),
  inferredBounds:     jsonb('inferred_bounds'),
  description:        text('description'),
  sourceClause:       text('source_clause').notNull(),
  documentId:         text('document_id'),
  clauseRef:          text('clause_ref'),
  surfacingClientId:  text('surfacing_client_id').notNull(),
  seenCount:          integer('seen_count').notNull().default(1),
  lifecycleStatus:    text('lifecycle_status').notNull().default('captured'),
  promotedBy:         text('promoted_by'),
  promotedAt:         timestamp('promoted_at', { withTimezone: true }),
  rejectedBy:         text('rejected_by'),
  rejectedAt:         timestamp('rejected_at', { withTimezone: true }),
  rejectReason:       text('reject_reason'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:          timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('idx_taxonomy_candidates_rule_key').on(t.ruleKey).where(sql`${t.deletedAt} IS NULL`),
  index('idx_taxonomy_candidates_seen_count').on(sql`${t.seenCount} DESC`).where(sql`${t.deletedAt} IS NULL`),
  index('idx_taxonomy_candidates_status').on(t.lifecycleStatus).where(sql`${t.deletedAt} IS NULL`),
  index('idx_taxonomy_candidates_client').on(t.surfacingClientId).where(sql`${t.deletedAt} IS NULL`),
]);

/** T4 Client Ambiguity Dashboard — client decisions on unmappable clauses (ADR 0012 D5). */
export const policyScopeExclusions = pgTable('policy_scope_exclusions', {
  id:             text('id').primaryKey().default(pseId),
  clientId:       text('client_id').notNull(),
  policyId:       text('policy_id'),
  rulesetId:      text('ruleset_id'),
  clauseRef:      text('clause_ref'),
  clauseText:     text('clause_text').notNull(),
  exclusionType:  text('exclusion_type').notNull().default('exclude'),
  reason:         text('reason'),
  ruleKey:        text('rule_key'),
  conditionJson:  jsonb('condition_json'),
  status:         text('status').notNull().default('pending_review'),
  excludedBy:     text('excluded_by'),
  excludedAt:     timestamp('excluded_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedBy:     text('reviewed_by'),
  reviewedAt:     timestamp('reviewed_at', { withTimezone: true }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:      timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('idx_scope_exclusions_client').on(t.clientId, t.status),
  index('idx_scope_exclusions_policy').on(t.policyId, t.exclusionType),
  index('idx_scope_exclusions_clause').on(t.clientId, t.clauseText),
]);

// ── Gateway readiness ──────────────────────────────────────────────

export const gatewayReadinessAssessments = pgTable('gateway_readiness_assessments', {
  id:                      text('id').primaryKey().default(graId),
  clientId:                text('client_id').notNull(),
  rulesetId:               text('ruleset_id'),
  backtestRunId:           text('backtest_run_id'),
  periodStart:             date('period_start').notNull(),
  periodEnd:               date('period_end').notNull(),
  preventableMarginLoss:   numeric('preventable_margin_loss').notNull().default('0'),
  nonPreventableRecovery:  numeric('non_preventable_recovery').notNull().default('0'),
  uninsuredExposure:       numeric('uninsured_exposure').notNull().default('0'),
  topCategories:           jsonb('top_categories'),
  recommendedControls:     jsonb('recommended_controls'),
  status:                  text('status').notNull().default('draft'),
  createdAt:               timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt:             timestamp('delivered_at', { withTimezone: true }),
}, (t) => [
  index('idx_gateway_assessments_client').on(t.clientId, t.createdAt),
  index('idx_gateway_assessments_backtest').on(t.backtestRunId),
]);
