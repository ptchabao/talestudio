ALTER TABLE "episode" ADD COLUMN "kind" text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "sources" text;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "source_key" text;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "source_duration_sec" integer;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "transcript" jsonb;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "highlights" jsonb;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "claims" jsonb;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "clips" jsonb DEFAULT '{}'::jsonb NOT NULL;
