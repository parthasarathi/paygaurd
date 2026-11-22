CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "imap_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "imap_host" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "imap_port" integer DEFAULT 993;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "imap_user" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "imap_pass_enc" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "imap_folder" text DEFAULT 'INBOX';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "imap_last_poll_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "imap_last_error" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "webhook_url" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "webhook_secret_enc" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;