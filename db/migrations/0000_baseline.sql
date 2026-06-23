CREATE TABLE "app_users" (
	"id" text PRIMARY KEY DEFAULT 'usr' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'client' NOT NULL,
	"client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Audit Results" (
	"id" text PRIMARY KEY DEFAULT 'rec' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"Invoice" text[],
	"Invoice line" text[],
	"Audit Rules" text[],
	"Outcome" text,
	"Expected amount" numeric,
	"Billed amount" numeric,
	"Variance" numeric,
	"Notes" text,
	"Audited at" text,
	"Detected by" text,
	"Disputes" text[],
	"Review status" text,
	"Client" text[],
	"Carrier SCAC" text,
	"Carrier (display)" text,
	"Carrier" text,
	"Invoice number" text,
	"Tracking number" text,
	"Recoverable amount" numeric,
	"Recover amount" numeric,
	"Rule name" text,
	"Rule" text
);
--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" text PRIMARY KEY DEFAULT 'run' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"client_id" text,
	"client_name" text,
	"dry_run" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"invoices_checked" integer DEFAULT 0 NOT NULL,
	"findings_created" integer DEFAULT 0 NOT NULL,
	"total_variance" numeric DEFAULT '0' NOT NULL,
	"errors" text[] DEFAULT '{}'::text[] NOT NULL,
	"triggered_by" text
);
--> statement-breakpoint
CREATE TABLE "Carrier Codes" (
	"id" text PRIMARY KEY DEFAULT 'rec' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"SCAC code" text,
	"Carrier SCAC" text,
	"Filing window days" numeric
);
--> statement-breakpoint
CREATE TABLE "Carriers" (
	"id" text PRIMARY KEY DEFAULT 'rec' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"SCAC" text,
	"Carrier name" text,
	"Carrier type" text,
	"Contact email" text
);
--> statement-breakpoint
CREATE TABLE "Clients" (
	"id" text PRIMARY KEY DEFAULT 'rec' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"Company name" text,
	"Contract active" boolean,
	"Gain share pct" numeric,
	"Min invoice threshold" numeric,
	"Last audit run" text
);
--> statement-breakpoint
CREATE TABLE "dispute_outcomes" (
	"id" text PRIMARY KEY DEFAULT 'do'  || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"dispute_id" text NOT NULL,
	"outcome" text NOT NULL,
	"recovery_amount" numeric,
	"confidence" numeric,
	"reasoning" text,
	"source_text" text,
	"applied_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rule_code" text,
	"carrier_scac" text,
	"disputed_amount" numeric
);
--> statement-breakpoint
CREATE TABLE "Disputes" (
	"id" text PRIMARY KEY DEFAULT 'rec' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"Dispute ID" text,
	"Invoice" text[],
	"Audit result" text[],
	"Client" text[],
	"Audit rule" text[],
	"Carrier (display)" text,
	"Carrier" text,
	"Tracking number" text,
	"Disputed amount" numeric,
	"Status" text,
	"Opened date" text,
	"Filed date" text,
	"Carrier response date" text,
	"Escalation date" text,
	"Escalation reason" text,
	"Date resolved" text,
	"Recovery amount" numeric,
	"Resolution notes" text
);
--> statement-breakpoint
CREATE TABLE "ingestion_exceptions" (
	"id" text PRIMARY KEY DEFAULT 'exc' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"mapping_type" text NOT NULL,
	"carrier_scac" text,
	"raw_code" text NOT NULL,
	"source" text,
	"sample" jsonb,
	"suggested_code" text,
	"reasoning" text,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"learned_mapping_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suggested_confidence" numeric
);
--> statement-breakpoint
CREATE TABLE "Invoices" (
	"id" text PRIMARY KEY DEFAULT 'rec' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"Invoice number" text,
	"Status" text,
	"Amount billed" numeric,
	"Amount approved" numeric,
	"Amount disputed" numeric,
	"Shipment" text[],
	"Carrier" text[],
	"Invoice date" text,
	"Payment due date" text,
	"Clients" text[]
);
--> statement-breakpoint
CREATE TABLE "learned_mappings" (
	"id" text PRIMARY KEY DEFAULT 'lm'  || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"mapping_type" text NOT NULL,
	"carrier_scac" text,
	"raw_code" text NOT NULL,
	"standard_code" text NOT NULL,
	"author" text DEFAULT 'HUMAN_ANALYST' NOT NULL,
	"confidence" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rulebook" (
	"id" text PRIMARY KEY DEFAULT 'rb'  || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"scope" text NOT NULL,
	"client_id" text,
	"carrier_scac" text,
	"service_level" text,
	"rule_key" text NOT NULL,
	"num_value" numeric,
	"bool_value" boolean,
	"text_value" text,
	"effective_from" date,
	"effective_to" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clause_ref" text
);
--> statement-breakpoint
CREATE TABLE "Shipments" (
	"id" text PRIMARY KEY DEFAULT 'rec' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"PRO number" text,
	"Tracking number" text,
	"Actual L" numeric,
	"Actual W" numeric,
	"Actual H" numeric,
	"Actual weight lbs" numeric,
	"Ship date" text,
	"Delivery date" text,
	"Service level" text,
	"Carrier" text,
	"Destination zip" text,
	"Address classification" text
);
--> statement-breakpoint
CREATE TABLE "tpl_fulfillment_lines" (
	"id" text PRIMARY KEY DEFAULT 'tplf' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"client_id" text,
	"carrier_scac" text,
	"invoice_cycle" text,
	"order_id" text,
	"wms_shipment_id" text,
	"tracking_number" text,
	"units_picked" integer,
	"base_pick_fee" numeric,
	"additional_pick_fee" numeric,
	"packaging_fee" numeric,
	"billed_dims" text,
	"billed_weight" numeric,
	"base_freight" numeric,
	"fuel_surcharge" numeric,
	"accessorials" jsonb,
	"total_billed" numeric,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"matched_shipment_id" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"carrier_pro" text,
	"base_carrier_cost" numeric,
	"audit_status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tpl_storage_lines" (
	"id" text PRIMARY KEY DEFAULT 'tpls' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"client_id" text,
	"invoice_cycle" text,
	"sku" text,
	"storage_type" text,
	"qty_on_hand" integer,
	"cubic_volume" numeric,
	"location_id" text,
	"billed_amount" numeric,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"audit_status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_logs" (
	"id" text PRIMARY KEY DEFAULT 'upl' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_id" text,
	"uploaded_by" text,
	"file_name" text,
	"rows" integer DEFAULT 0 NOT NULL,
	"staged" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"data_health" numeric DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_app_users_email" ON "app_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_audit_outcome" ON "Audit Results" USING btree ("Outcome");--> statement-breakpoint
CREATE INDEX "idx_audit_runs_started" ON "audit_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_carrier_scac" ON "Carriers" USING btree ("SCAC");--> statement-breakpoint
CREATE INDEX "idx_dispute_outcomes_dispute" ON "dispute_outcomes" USING btree ("dispute_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_dispute_status" ON "Disputes" USING btree ("Status");--> statement-breakpoint
CREATE INDEX "idx_exc_status" ON "ingestion_exceptions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_exc_dedup" ON "ingestion_exceptions" USING btree ("mapping_type",COALESCE("carrier_scac", ''),upper("raw_code"),"status");--> statement-breakpoint
CREATE INDEX "idx_invoice_number" ON "Invoices" USING btree ("Invoice number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_learned_mapping" ON "learned_mappings" USING btree ("mapping_type",COALESCE("carrier_scac", ''),upper("raw_code"));--> statement-breakpoint
CREATE INDEX "idx_rulebook_key" ON "rulebook" USING btree ("rule_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rulebook_scope" ON "rulebook" USING btree ("scope",COALESCE("client_id", ''),COALESCE("carrier_scac", ''),COALESCE("service_level", ''),"rule_key",COALESCE("effective_from", '1900-01-01'::date));--> statement-breakpoint
CREATE INDEX "idx_shipment_pro" ON "Shipments" USING btree ("PRO number");--> statement-breakpoint
CREATE INDEX "idx_shipment_tracking" ON "Shipments" USING btree ("Tracking number");--> statement-breakpoint
CREATE INDEX "idx_tplf_audit" ON "tpl_fulfillment_lines" USING btree ("audit_status");--> statement-breakpoint
CREATE INDEX "idx_tplf_cycle" ON "tpl_fulfillment_lines" USING btree ("client_id","invoice_cycle","created_at");--> statement-breakpoint
CREATE INDEX "idx_tplf_match" ON "tpl_fulfillment_lines" USING btree ("match_status");--> statement-breakpoint
CREATE INDEX "idx_tpls_audit" ON "tpl_storage_lines" USING btree ("audit_status");--> statement-breakpoint
CREATE INDEX "idx_tpls_cycle" ON "tpl_storage_lines" USING btree ("client_id","invoice_cycle","created_at");--> statement-breakpoint
CREATE INDEX "idx_upload_logs_client" ON "upload_logs" USING btree ("client_id","created_at");