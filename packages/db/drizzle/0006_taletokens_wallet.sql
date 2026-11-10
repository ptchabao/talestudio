ALTER TYPE "ledger_reason" ADD VALUE IF NOT EXISTS 'topup';--> statement-breakpoint
UPDATE "organization" SET "plan" = 'payg';--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "plan" SET DEFAULT 'payg';--> statement-breakpoint
-- Legacy credits sold at $0.48–0.56 become TaleTokens at 50 TT each. Ledger and balances scale together,
-- so organization.credits = SUM(credit_ledger.delta) still holds.
UPDATE "credit_ledger" SET "delta" = "delta" * 50;--> statement-breakpoint
UPDATE "organization" SET "credits" = "credits" * 50;--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "current_period_end";--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
	"user_id" text REFERENCES "user"("id") ON DELETE set null,
	"provider" text DEFAULT 'cinetpay' NOT NULL,
	"transaction_id" text NOT NULL UNIQUE,
	"amount_xof" integer NOT NULL,
	"tokens" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"operator_id" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "payment_org_idx" ON "payment" USING btree ("organization_id","created_at");
