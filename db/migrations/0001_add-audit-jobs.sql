CREATE TABLE "audit_jobs" (
	"id" text PRIMARY KEY DEFAULT 'job' || replace(gen_random_uuid()::text, '-', '') NOT NULL,
	"job_type" text DEFAULT 'parcel' NOT NULL,
	"client_id" text,
	"dry_run" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"run_id" text,
	"result" jsonb,
	"error" text,
	"triggered_by" text,
	"cycle" text
);
--> statement-breakpoint
CREATE INDEX "idx_audit_jobs_status" ON "audit_jobs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "idx_audit_jobs_client" ON "audit_jobs" USING btree ("client_id","status");