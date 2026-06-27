import { pgTable, index, text, timestamp, boolean, integer, numeric, foreignKey, unique, uniqueIndex, check, jsonb, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const auditRuns = pgTable("audit_runs", {
	id: text().default(sql`('run'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	clientId: text("client_id"),
	clientName: text("client_name"),
	dryRun: boolean("dry_run").default(false).notNull(),
	status: text().default('running').notNull(),
	invoicesChecked: integer("invoices_checked").default(0).notNull(),
	findingsCreated: integer("findings_created").default(0).notNull(),
	totalVariance: numeric("total_variance").default('0').notNull(),
	errors: text().array().default([""]).notNull(),
	triggeredBy: text("triggered_by"),
}, (table) => [
	index("idx_audit_runs_started").using("btree", table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const uploadLogs = pgTable("upload_logs", {
	id: text().default(sql`('upl'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	clientId: text("client_id"),
	uploadedBy: text("uploaded_by"),
	fileName: text("file_name"),
	rows: integer().default(0).notNull(),
	staged: integer().default(0).notNull(),
	skipped: integer().default(0).notNull(),
	failed: integer().default(0).notNull(),
	dataHealth: numeric("data_health").default('0').notNull(),
	status: text().default('ok').notNull(),
}, (table) => [
	index("idx_upload_logs_client").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
]);

export const carriers = pgTable("Carriers", {
	id: text().default(sql`('rec'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	scac: text("SCAC"),
	carrierName: text("Carrier name"),
	carrierType: text("Carrier type"),
	contactEmail: text("Contact email"),
}, (table) => [
	index("idx_carrier_scac").using("btree", table.scac.asc().nullsLast().op("text_ops")),
]);

export const carrierCodes = pgTable("Carrier Codes", {
	id: text().default(sql`('rec'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	scacCode: text("SCAC code"),
	carrierScac: text("Carrier SCAC"),
	filingWindowDays: numeric("Filing window days"),
});

export const shipments = pgTable("Shipments", {
	id: text().default(sql`('rec'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	proNumber: text("PRO number"),
	trackingNumber: text("Tracking number"),
	actualL: numeric("Actual L"),
	actualW: numeric("Actual W"),
	actualH: numeric("Actual H"),
	actualWeightLbs: numeric("Actual weight lbs"),
	shipDate: text("Ship date"),
	deliveryDate: text("Delivery date"),
	serviceLevel: text("Service level"),
	carrier: text("Carrier"),
	destinationZip: text("Destination zip"),
	addressClassification: text("Address classification"),
}, (table) => [
	index("idx_shipment_pro").using("btree", table.proNumber.asc().nullsLast().op("text_ops")),
	index("idx_shipment_tracking").using("btree", table.trackingNumber.asc().nullsLast().op("text_ops")),
]);

export const invoices = pgTable("Invoices", {
	id: text().default(sql`('rec'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	invoiceNumber: text("Invoice number"),
	status: text("Status"),
	amountBilled: numeric("Amount billed"),
	amountApproved: numeric("Amount approved"),
	amountDisputed: numeric("Amount disputed"),
	shipment: text("Shipment").array(),
	carrier: text("Carrier").array(),
	invoiceDate: text("Invoice date"),
	paymentDueDate: text("Payment due date"),
	clients: text("Clients").array(),
}, (table) => [
	index("idx_invoice_number").using("btree", table.invoiceNumber.asc().nullsLast().op("text_ops")),
]);

export const auditResults = pgTable("Audit Results", {
	id: text().default(sql`('rec'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	invoice: text("Invoice").array(),
	invoiceLine: text("Invoice line").array(),
	auditRules: text("Audit Rules").array(),
	outcome: text("Outcome"),
	expectedAmount: numeric("Expected amount"),
	billedAmount: numeric("Billed amount"),
	variance: numeric("Variance"),
	notes: text("Notes"),
	auditedAt: text("Audited at"),
	detectedBy: text("Detected by"),
	disputes: text("Disputes").array(),
	reviewStatus: text("Review status"),
	client: text("Client").array(),
	carrierScac: text("Carrier SCAC"),
	"carrier (display)": text("Carrier (display)"),
	carrier: text("Carrier"),
	invoiceNumber: text("Invoice number"),
	trackingNumber: text("Tracking number"),
	recoverableAmount: numeric("Recoverable amount"),
	recoverAmount: numeric("Recover amount"),
	ruleName: text("Rule name"),
	rule: text("Rule"),
}, (table) => [
	index("idx_audit_outcome").using("btree", table.outcome.asc().nullsLast().op("text_ops")),
]);

export const disputes = pgTable("Disputes", {
	id: text().default(sql`('rec'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	disputeId: text("Dispute ID"),
	invoice: text("Invoice").array(),
	auditResult: text("Audit result").array(),
	client: text("Client").array(),
	auditRule: text("Audit rule").array(),
	"carrier (display)": text("Carrier (display)"),
	carrier: text("Carrier"),
	trackingNumber: text("Tracking number"),
	disputedAmount: numeric("Disputed amount"),
	status: text("Status"),
	openedDate: text("Opened date"),
	filedDate: text("Filed date"),
	carrierResponseDate: text("Carrier response date"),
	escalationDate: text("Escalation date"),
	escalationReason: text("Escalation reason"),
	dateResolved: text("Date resolved"),
	recoveryAmount: numeric("Recovery amount"),
	resolutionNotes: text("Resolution notes"),
}, (table) => [
	index("idx_dispute_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const clients = pgTable("Clients", {
	id: text().default(sql`('rec'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	companyName: text("Company name"),
	contractActive: boolean("Contract active"),
	gainSharePct: numeric("Gain share pct"),
	minInvoiceThreshold: numeric("Min invoice threshold"),
	lastAuditRun: text("Last audit run"),
});

export const appUsers = pgTable("app_users", {
	id: text().default(sql`('usr'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	email: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	name: text(),
	role: text().default('client').notNull(),
	clientId: text("client_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_app_users_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "app_users_client_id_fkey"
		}),
	unique("app_users_email_key").on(table.email),
]);

export const learnedMappings = pgTable("learned_mappings", {
	id: text().default(sql`('lm'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	mappingType: text("mapping_type").notNull(),
	carrierScac: text("carrier_scac"),
	rawCode: text("raw_code").notNull(),
	standardCode: text("standard_code").notNull(),
	author: text().default('HUMAN_ANALYST').notNull(),
	confidence: numeric(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("uq_learned_mapping").using("btree", sql`mapping_type`, sql`COALESCE(carrier_scac, ''::text)`, sql`upper(raw_code)`),
	check("learned_mappings_mapping_type_check", sql`mapping_type = ANY (ARRAY['accessorial'::text, 'service_level'::text])`),
]);

export const ingestionExceptions = pgTable("ingestion_exceptions", {
	id: text().default(sql`('exc'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	mappingType: text("mapping_type").notNull(),
	carrierScac: text("carrier_scac"),
	rawCode: text("raw_code").notNull(),
	source: text(),
	sample: jsonb(),
	suggestedCode: text("suggested_code"),
	reasoning: text(),
	occurrences: integer().default(1).notNull(),
	status: text().default('open').notNull(),
	resolvedBy: text("resolved_by"),
	resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: 'string' }),
	learnedMappingId: text("learned_mapping_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	suggestedConfidence: numeric("suggested_confidence"),
}, (table) => [
	index("idx_exc_dedup").using("btree", sql`mapping_type`, sql`COALESCE(carrier_scac, ''::text)`, sql`upper(raw_code)`, sql`status`),
	index("idx_exc_status").using("btree", table.status.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	check("ingestion_exceptions_status_check", sql`status = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text])`),
]);

export const disputeOutcomes = pgTable("dispute_outcomes", {
	id: text().default(sql`('do'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	disputeId: text("dispute_id").notNull(),
	outcome: text().notNull(),
	recoveryAmount: numeric("recovery_amount"),
	confidence: numeric(),
	reasoning: text(),
	sourceText: text("source_text"),
	appliedBy: text("applied_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	ruleCode: text("rule_code"),
	carrierScac: text("carrier_scac"),
	disputedAmount: numeric("disputed_amount"),
}, (table) => [
	index("idx_dispute_outcomes_dispute").using("btree", table.disputeId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
]);

export const rulebook = pgTable("rulebook", {
	id: text().default(sql`('rb'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	scope: text().notNull(),
	clientId: text("client_id"),
	carrierScac: text("carrier_scac"),
	serviceLevel: text("service_level"),
	ruleKey: text("rule_key").notNull(),
	numValue: numeric("num_value"),
	boolValue: boolean("bool_value"),
	textValue: text("text_value"),
	effectiveFrom: date("effective_from"),
	effectiveTo: date("effective_to"),
	note: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	clauseRef: text("clause_ref"),
}, (table) => [
	index("idx_rulebook_key").using("btree", table.ruleKey.asc().nullsLast().op("text_ops")),
	uniqueIndex("uq_rulebook_scope").using("btree", sql`scope`, sql`COALESCE(client_id, ''::text)`, sql`COALESCE(carrier_scac, ''::text)`, sql`COALESCE(service_level, ''::text)`, sql`rule_key`, sql`COALESCE(effective_from, '1900-01-01'::date)`),
	check("rulebook_scope_check", sql`scope = ANY (ARRAY['global'::text, 'carrier'::text, 'contract'::text])`),
]);

export const tplFulfillmentLines = pgTable("tpl_fulfillment_lines", {
	id: text().default(sql`('tplf'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	clientId: text("client_id"),
	carrierScac: text("carrier_scac"),
	invoiceCycle: text("invoice_cycle"),
	orderId: text("order_id"),
	wmsShipmentId: text("wms_shipment_id"),
	trackingNumber: text("tracking_number"),
	unitsPicked: integer("units_picked"),
	basePickFee: numeric("base_pick_fee"),
	additionalPickFee: numeric("additional_pick_fee"),
	packagingFee: numeric("packaging_fee"),
	billedDims: text("billed_dims"),
	billedWeight: numeric("billed_weight"),
	baseFreight: numeric("base_freight"),
	fuelSurcharge: numeric("fuel_surcharge"),
	accessorials: jsonb(),
	totalBilled: numeric("total_billed"),
	matchStatus: text("match_status").default('unmatched').notNull(),
	matchedShipmentId: text("matched_shipment_id"),
	raw: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	carrierPro: text("carrier_pro"),
	baseCarrierCost: numeric("base_carrier_cost"),
	auditStatus: text("audit_status").default('pending').notNull(),
}, (table) => [
	index("idx_tplf_audit").using("btree", table.auditStatus.asc().nullsLast().op("text_ops")),
	index("idx_tplf_cycle").using("btree", table.clientId.asc().nullsLast().op("timestamptz_ops"), table.invoiceCycle.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
	index("idx_tplf_match").using("btree", table.matchStatus.asc().nullsLast().op("text_ops")),
]);

export const tplStorageLines = pgTable("tpl_storage_lines", {
	id: text().default(sql`('tpls'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	clientId: text("client_id"),
	invoiceCycle: text("invoice_cycle"),
	sku: text(),
	storageType: text("storage_type"),
	qtyOnHand: integer("qty_on_hand"),
	cubicVolume: numeric("cubic_volume"),
	locationId: text("location_id"),
	billedAmount: numeric("billed_amount"),
	raw: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	auditStatus: text("audit_status").default('pending').notNull(),
}, (table) => [
	index("idx_tpls_audit").using("btree", table.auditStatus.asc().nullsLast().op("text_ops")),
	index("idx_tpls_cycle").using("btree", table.clientId.asc().nullsLast().op("timestamptz_ops"), table.invoiceCycle.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("text_ops")),
]);

export const auditJobs = pgTable("audit_jobs", {
	id: text().default(sql`('job'::text || replace((gen_random_uuid())::text, '-'::text, '::text))`).primaryKey().notNull(),
	jobType: text("job_type").default('parcel').notNull(),
	clientId: text("client_id"),
	dryRun: boolean("dry_run").default(false).notNull(),
	status: text().default('queued').notNull(),
	queuedAt: timestamp("queued_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	runId: text("run_id"),
	result: jsonb(),
	error: text(),
	triggeredBy: text("triggered_by"),
	cycle: text(),
}, (table) => [
	index("idx_audit_jobs_client").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("idx_audit_jobs_status").using("btree", table.status.asc().nullsLast().op("text_ops"), table.queuedAt.asc().nullsLast().op("text_ops")),
]);

export const migrations = pgTable("_migrations", {
	name: text().primaryKey().notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
