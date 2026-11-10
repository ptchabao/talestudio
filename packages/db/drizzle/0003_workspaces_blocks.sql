-- Workspaces (organizations, roles, invitations), projects per studio, block runs, approval flow.
-- Hand-written: it renames tables/columns and backfills existing data instead of dropping it.

ALTER TYPE "public"."ledger_reason" ADD VALUE IF NOT EXISTS 'keyframe_redraw';--> statement-breakpoint

CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"personal" boolean DEFAULT false NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organization_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "organization_credits_non_negative" CHECK ("organization"."credits" >= 0)
);--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_idx" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token" text NOT NULL,
	"invited_by" text REFERENCES "user"("id") ON DELETE set null,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_unique" UNIQUE("token")
);--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint

-- One personal workspace per existing user, inheriting their plan, credits and Stripe customer.
INSERT INTO "organization" ("name", "slug", "personal", "plan", "credits", "stripe_customer_id", "stripe_subscription_id", "current_period_end")
SELECT u."name", 'personal-' || lower(u."id"), true, u."plan", u."credits", u."stripe_customer_id", u."stripe_subscription_id", u."current_period_end" FROM "user" u;--> statement-breakpoint
INSERT INTO "member" ("organization_id", "user_id", "role")
SELECT o."id", u."id", 'owner' FROM "user" u JOIN "organization" o ON o."slug" = 'personal-' || lower(u."id");--> statement-breakpoint

-- Ledger moves from user to organization; the user becomes the actor.
ALTER TABLE "credit_ledger" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
UPDATE "credit_ledger" l SET "organization_id" = o."id" FROM "organization" o WHERE o."slug" = 'personal-' || lower(l."user_id");--> statement-breakpoint
ALTER TABLE "credit_ledger" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "credit_ledger" DROP CONSTRAINT "credit_ledger_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "credit_ledger" RENAME COLUMN "user_id" TO "actor_id";--> statement-breakpoint
ALTER TABLE "credit_ledger" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE set null;--> statement-breakpoint
DROP INDEX "ledger_user_idx";--> statement-breakpoint
CREATE INDEX "ledger_org_idx" ON "credit_ledger" USING btree ("organization_id","created_at");--> statement-breakpoint

-- series → project
ALTER TABLE "series" RENAME TO "project";--> statement-breakpoint
ALTER INDEX "series_pkey" RENAME TO "project_pkey";--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
UPDATE "project" p SET "organization_id" = o."id" FROM "organization" o WHERE o."slug" = 'personal-' || lower(p."user_id");--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "series_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "project" RENAME COLUMN "user_id" TO "created_by";--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "studio" text DEFAULT 'story' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "brief" jsonb;--> statement-breakpoint
DROP INDEX "series_user_created_idx";--> statement-breakpoint
CREATE INDEX "project_org_updated_idx" ON "project" USING btree ("organization_id","updated_at");--> statement-breakpoint

-- series_character → cast_member
ALTER TABLE "series_character" RENAME TO "cast_member";--> statement-breakpoint
ALTER INDEX "series_character_pkey" RENAME TO "cast_member_pkey";--> statement-breakpoint
ALTER TABLE "cast_member" RENAME COLUMN "series_id" TO "project_id";--> statement-breakpoint
ALTER TABLE "cast_member" RENAME CONSTRAINT "series_character_series_id_series_id_fk" TO "cast_member_project_id_project_id_fk";--> statement-breakpoint
ALTER INDEX "series_character_slug_idx" RENAME TO "cast_member_slug_idx";--> statement-breakpoint

-- episode: belongs to a project + organization, pinned workflow, approval, multi-format renders
ALTER TABLE "episode" RENAME COLUMN "series_id" TO "project_id";--> statement-breakpoint
ALTER TABLE "episode" RENAME CONSTRAINT "episode_series_id_series_id_fk" TO "episode_project_id_project_id_fk";--> statement-breakpoint
ALTER INDEX "episode_series_number_idx" RENAME TO "episode_project_number_idx";--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
UPDATE "episode" e SET "organization_id" = p."organization_id" FROM "project" p WHERE p."id" = e."project_id";--> statement-breakpoint
ALTER TABLE "episode" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "episode" DROP CONSTRAINT "episode_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "episode" RENAME COLUMN "user_id" TO "created_by";--> statement-breakpoint
ALTER TABLE "episode" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "workflow" text DEFAULT 'story-episode@1' NOT NULL;--> statement-breakpoint
ALTER TABLE "episode" ALTER COLUMN "workflow" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "formats" jsonb DEFAULT '["16:9"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "production_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "approved_by" text REFERENCES "user"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "renders" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "episode" SET "renders" = jsonb_build_object('16:9', "final_video_key") WHERE "final_video_key" IS NOT NULL;--> statement-breakpoint
UPDATE "episode" SET "production_attempts" = 1, "approved_at" = "created_at" WHERE "mode" = 'full';--> statement-breakpoint
ALTER TABLE "episode" DROP COLUMN "final_video_key";--> statement-breakpoint
ALTER TABLE "episode" DROP COLUMN "mode";--> statement-breakpoint
ALTER TABLE "episode" DROP COLUMN "credits_reserved";--> statement-breakpoint
DROP TYPE "public"."episode_mode";--> statement-breakpoint
DROP INDEX "episode_user_created_idx";--> statement-breakpoint
CREATE INDEX "episode_org_created_idx" ON "episode" USING btree ("organization_id","created_at");--> statement-breakpoint

CREATE TABLE "block_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL REFERENCES "episode"("id") ON DELETE cascade,
	"node_id" text NOT NULL,
	"block" text NOT NULL,
	"block_version" integer NOT NULL,
	"stage" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"items_total" integer DEFAULT 0 NOT NULL,
	"items_done" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);--> statement-breakpoint
CREATE UNIQUE INDEX "block_run_node_idx" ON "block_run" USING btree ("episode_id","node_id");--> statement-breakpoint

-- Billing moved to organization.
ALTER TABLE "user" DROP CONSTRAINT "user_credits_non_negative";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "plan";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "credits";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "current_period_end";
