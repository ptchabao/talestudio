CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"style" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_character" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"appearance" text NOT NULL,
	"voice" text NOT NULL,
	"image_key" text,
	"introduced_in" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "number" integer;--> statement-breakpoint
-- Backfill: episodes created before series existed go into one series per user, numbered by creation date.
INSERT INTO "series" ("user_id", "title", "description", "style", "language")
SELECT DISTINCT ON ("user_id") "user_id", 'My first series', 'Episodes created before series were introduced.', "style", "language"
FROM "episode" ORDER BY "user_id", "created_at";--> statement-breakpoint
UPDATE "episode" e SET "series_id" = s."id", "number" = n."rn"
FROM "series" s, (SELECT "id", row_number() OVER (PARTITION BY "user_id" ORDER BY "created_at") AS "rn" FROM "episode") n
WHERE s."user_id" = e."user_id" AND n."id" = e."id";--> statement-breakpoint
ALTER TABLE "episode" ALTER COLUMN "series_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "episode" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_character" ADD CONSTRAINT "series_character_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "series_user_created_idx" ON "series" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "series_character_slug_idx" ON "series_character" USING btree ("series_id","slug");--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "episode_series_number_idx" ON "episode" USING btree ("series_id","number");