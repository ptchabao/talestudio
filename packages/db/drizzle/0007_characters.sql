ALTER TYPE "ledger_reason" ADD VALUE IF NOT EXISTS 'character_generation';--> statement-breakpoint
CREATE TABLE "character" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'story' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"style" text DEFAULT 'cinematic' NOT NULL,
	"appearance" text NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"backstory" text DEFAULT '' NOT NULL,
	"voice_kind" text DEFAULT 'narrator' NOT NULL,
	"voice_style" text DEFAULT '' NOT NULL,
	"master_key" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text REFERENCES "user"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "character_org_slug_idx" ON "character" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "character_org_idx" ON "character" USING btree ("organization_id");--> statement-breakpoint
CREATE TABLE "character_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL REFERENCES "character"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"check" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "character_reference_idx" ON "character_reference" USING btree ("character_id","kind");--> statement-breakpoint
CREATE TABLE "character_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL REFERENCES "character"("id") ON DELETE cascade,
	"organization_id" uuid NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"tokens" integer NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"error" text,
	"created_by" text REFERENCES "user"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "character_job_idx" ON "character_job" USING btree ("character_id","created_at");--> statement-breakpoint
CREATE TABLE "character_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL REFERENCES "character"("id") ON DELETE cascade,
	"episode_id" uuid REFERENCES "episode"("id") ON DELETE set null,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "character_event_idx" ON "character_event" USING btree ("character_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "character_event_episode_idx" ON "character_event" USING btree ("character_id","episode_id");--> statement-breakpoint
CREATE TABLE "character_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL REFERENCES "character"("id") ON DELETE cascade,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "character_version_idx" ON "character_version" USING btree ("character_id","version");--> statement-breakpoint
ALTER TABLE "cast_member" ADD COLUMN "character_id" uuid REFERENCES "character"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "character_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "asset" ADD COLUMN "check" jsonb;--> statement-breakpoint
-- Every existing project cast member becomes a draft library character with its portrait as master.
-- Voice archetype mirrors voiceKind() in packages/ai/src/elevenlabs.ts.
WITH src AS MATERIALIZED (
	SELECT cm.id AS cast_id, p.organization_id AS org, cm.slug, cm.name, cm.appearance, cm.voice, cm.bio, cm.image_key, p.style,
		row_number() OVER (PARTITION BY p.organization_id, cm.slug ORDER BY cm.created_at) AS rn,
		gen_random_uuid() AS new_id
	FROM "cast_member" cm JOIN "project" p ON p.id = cm.project_id
	WHERE cm.character_id IS NULL
), ins AS (
	INSERT INTO "character" ("id", "organization_id", "slug", "name", "style", "appearance", "backstory", "voice_kind", "voice_style", "master_key")
	SELECT new_id, org, CASE WHEN rn = 1 THEN slug ELSE slug || '-' || rn END, name, style, appearance, coalesce(bio, ''),
		CASE
			WHEN lower(voice) ~ '\m(child|kid|boy|girl|young child)\M' THEN 'child'
			WHEN lower(voice) ~ '\m(female|woman|girl|she|her)\M' THEN CASE WHEN lower(voice) ~ '\m(young|teen)\M' THEN 'womanYoung' ELSE 'womanAdult' END
			WHEN lower(voice) ~ '\m(male|man|he|his)\M' THEN CASE WHEN lower(voice) ~ '\m(old|elder|elderly|gravel)\M' THEN 'manOld' ELSE 'manAdult' END
			ELSE 'narrator'
		END,
		voice, image_key
	FROM src
	RETURNING "id"
), refs AS (
	INSERT INTO "character_reference" ("character_id", "kind", "label", "storage_key", "content_type", "approved")
	SELECT new_id, 'master', 'master', image_key,
		CASE WHEN image_key LIKE '%.png' THEN 'image/png' WHEN image_key LIKE '%.svg' THEN 'image/svg+xml' WHEN image_key LIKE '%.webp' THEN 'image/webp' ELSE 'image/jpeg' END, true
	FROM src WHERE image_key IS NOT NULL
	RETURNING "id"
)
UPDATE "cast_member" cm SET "character_id" = src.new_id FROM src WHERE cm.id = src.cast_id;
