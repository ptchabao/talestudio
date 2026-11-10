CREATE TYPE "public"."asset_kind" AS ENUM('character', 'keyframe', 'clip', 'audio', 'lipsync', 'final', 'thumbnail', 'subtitles');--> statement-breakpoint
CREATE TYPE "public"."episode_mode" AS ENUM('storyboard', 'full');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('signup_grant', 'subscription_renewal', 'pack_purchase', 'episode_reserve', 'episode_refund', 'admin_adjustment');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"ref" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"provider" text NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"episode_id" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "episode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"premise" text NOT NULL,
	"style" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"duration_sec" integer NOT NULL,
	"mode" "episode_mode" NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"error" text,
	"script" jsonb,
	"credits_reserved" integer DEFAULT 0 NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"workflow_id" text,
	"final_video_key" text,
	"thumbnail_key" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "user_credits_non_negative" CHECK ("user"."credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_episode_kind_ref_idx" ON "asset" USING btree ("episode_id","kind","ref");--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "episode_user_created_idx" ON "episode" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");