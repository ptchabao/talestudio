import type { CharacterJobKind, CharacterKind, CharacterStatus, Claim, EpisodeStatus, Format, Highlight, PlanId, Platform, ReferenceKind, VoiceKindId, ProjectBrief, Role, Script, Studio, Style, TranscriptSegment } from "@talestudio/core";
import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ───────────────────────── Auth (Better Auth core tables) ───────────────────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

/* ───────────────────────── Workspaces ───────────────────────── */

/**
 * The tenant. The TaleToken wallet lives here, so a team shares one balance.
 * Every user gets a personal workspace at sign-up and can be invited into others.
 */
export const organization = pgTable(
  "organization",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    personal: boolean("personal").notNull().default(false),
    plan: text("plan").$type<PlanId>().notNull().default("payg"),
    /** Wallet balance in TaleTokens (TT). Only ever moved through applyCredits, which writes the ledger. */
    credits: integer("credits").notNull().default(0),
    ...timestamps,
  },
  (t) => [check("organization_credits_non_negative", sql`${t.credits} >= 0`)],
);

export const member = pgTable(
  "member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("member_org_user_idx").on(t.organizationId, t.userId), index("member_user_idx").on(t.userId)],
);

export const invitation = pgTable(
  "invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<Role>().notNull(),
    /** Random secret in the invite link. */
    token: text("token").notNull().unique(),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("invitation_org_idx").on(t.organizationId)],
);

/* ───────────────────────── Product ───────────────────────── */

/** A project belongs to a studio: a series (story), a campaign (advertising)… */
export const project = pgTable(
  "project",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    studio: text("studio").$type<Studio>().notNull().default("story"),
    title: text("title").notNull(),
    /** Series bible / campaign context. Fed to the writer for every production. */
    description: text("description").notNull(),
    style: text("style").$type<Style>().notNull(),
    language: text("language").notNull().default("en"),
    /** Studio-specific settings (advertising brief, podcast show format, newsroom line). */
    brief: jsonb("brief").$type<ProjectBrief>(),
    ...timestamps,
  },
  (t) => [index("project_org_updated_idx").on(t.organizationId, t.updatedAt)],
);

/**
 * Recurring cast, owned by the series. The reference portrait is generated once and reused by every
 * episode, which is what keeps characters consistent across a season (and saves re-generating them).
 * Portraits live under final/ — they must never expire like raw intermediates.
 */
export const castMember = pgTable(
  "cast_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    appearance: text("appearance").notNull(),
    voice: text("voice").notNull(),
    /** User-facing presentation, in the project language. */
    bio: text("bio"),
    imageKey: text("image_key"),
    /** Production in which the character first appeared. */
    introducedIn: uuid("introduced_in"),
    /** The workspace library character this cast member is (TaleStudio Characters). */
    characterId: uuid("character_id").references(() => character.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("cast_member_slug_idx").on(t.projectId, t.slug)],
);

/**
 * One production: an episode of a series or a creative of a campaign. It runs the workflow it was
 * created with (pinned `workflow` key), stage by stage: storyboard, then production after approval.
 */
export const episode = pgTable(
  "episode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** 1-based position in the project. */
    number: integer("number").notNull(),
    title: text("title").notNull(),
    premise: text("premise").notNull(),
    style: text("style").$type<Style>().notNull(),
    language: text("language").notNull().default("en"),
    durationSec: integer("duration_sec").notNull(),
    /** Workflow `id@version` this production is pinned to. */
    workflow: text("workflow").notNull(),
    /** Output formats; the first is the aspect ratio frames and clips are generated in. */
    formats: jsonb("formats").$type<Format[]>().notNull().default(["16:9"]),
    /** Where the production will be posted (TikTok, YouTube…): sets the formats and the script's pacing. */
    platforms: jsonb("platforms").$type<Platform[]>().notNull().default([]),
    /** Library characters the user asked to feature (TaleStudio Characters). */
    characterIds: jsonb("character_ids").$type<string[]>().notNull().default([]),
    /** "generated" (script → video) or "clips" (cut an uploaded recording). */
    kind: text("kind").$type<"generated" | "clips">().notNull().default("generated"),
    /** Journalism: sources provided by the user, numbered by line block. */
    sources: text("sources"),
    /** Podcast to Clips: uploaded recording and its declared duration. */
    sourceKey: text("source_key"),
    sourceDurationSec: integer("source_duration_sec"),
    transcript: jsonb("transcript").$type<TranscriptSegment[]>(),
    highlights: jsonb("highlights").$type<Highlight[]>(),
    claims: jsonb("claims").$type<Claim[]>(),
    /** Exported clips by highlight index. */
    clips: jsonb("clips").$type<Record<string, string>>().notNull().default({}),
    status: text("status").$type<EpisodeStatus>().notNull().default("queued"),
    progress: real("progress").notNull().default(0),
    error: text("error"),
    script: jsonb("script").$type<Script>(),
    /** Production runs started (retries after a failure get a fresh credit reservation). */
    /** Run counter: bumped by every approval and every relaunch (storyboard or production). Keys the credit reservation. */
    productionAttempts: integer("production_attempts").notNull().default(0),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    /** Real provider spend, accumulated by the pipeline. Feeds margin analytics. */
    costUsd: real("cost_usd").notNull().default(0),
    workflowId: text("workflow_id"),
    /** Final render per format, e.g. { "9:16": "final/…/9x16.mp4" }. */
    renders: jsonb("renders").$type<Partial<Record<Format, string>>>().notNull().default({}),
    thumbnailKey: text("thumbnail_key"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("episode_org_created_idx").on(t.organizationId, t.createdAt),
    uniqueIndex("episode_project_number_idx").on(t.projectId, t.number),
  ],
);

/** Execution state of each block of a production — what the pipeline view shows. */
export const blockRun = pgTable(
  "block_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episode.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    block: text("block").notNull(),
    blockVersion: integer("block_version").notNull(),
    stage: text("stage").notNull(),
    status: text("status").$type<"pending" | "running" | "completed" | "failed">().notNull().default("pending"),
    itemsTotal: integer("items_total").notNull().default(0),
    itemsDone: integer("items_done").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("block_run_node_idx").on(t.episodeId, t.nodeId)],
);

export const assetKind = pgEnum("asset_kind", ["character", "keyframe", "clip", "audio", "lipsync", "final", "thumbnail", "subtitles"]);

export const asset = pgTable(
  "asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episode.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    /** Shot index or character id this asset belongs to. */
    ref: text("ref").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    provider: text("provider").notNull(),
    costUsd: real("cost_usd").notNull().default(0),
    /** Keyframes of library characters: identity check against their master portrait. */
    check: jsonb("check").$type<{ same: boolean; score: number; issues: string; character: string }>(),
    /** Raw intermediates expire (S3 lifecycle on the raw/ prefix); finals do not. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("asset_episode_kind_ref_idx").on(t.episodeId, t.kind, t.ref)],
);

export const ledgerReason = pgEnum("ledger_reason", [
  "signup_grant",
  "subscription_renewal",
  "pack_purchase",
  "episode_reserve",
  "episode_refund",
  "admin_adjustment",
  "keyframe_redraw",
  "topup",
  "character_generation",
]);

/** Append-only credit ledger. `organization.credits` must always equal SUM(delta) per organization. */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Who triggered it (null for system events: payments, refunds). */
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    delta: integer("delta").notNull(),
    reason: ledgerReason("reason").notNull(),
    episodeId: uuid("episode_id").references(() => episode.id, { onDelete: "set null" }),
    /** Idempotency key (payment transaction, workflow reservation…) — prevents double grants on retries. */
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ledger_org_idx").on(t.organizationId, t.createdAt)],
);

/* ───────────────────────── Characters ───────────────────────── */

/**
 * A persistent character owned by the workspace (not by a project): every production can feature it without
 * duplicating its identity. Fictional only — references are generated, never photos of real people.
 */
export const character = pgTable(
  "character",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind").$type<CharacterKind>().notNull().default("story"),
    status: text("status").$type<CharacterStatus>().notNull().default("draft"),
    style: text("style").$type<Style>().notNull().default("cinematic"),
    /** Visual DNA, reused verbatim in every image prompt. */
    appearance: text("appearance").notNull(),
    personality: text("personality").notNull().default(""),
    backstory: text("backstory").notNull().default(""),
    voiceKind: text("voice_kind").$type<VoiceKindId>().notNull().default("narrator"),
    voiceStyle: text("voice_style").notNull().default(""),
    /** Storage key of the approved master portrait (null until one is chosen). */
    masterKey: text("master_key"),
    /** Bumped every time the identity is locked: each locked state is kept in character_version. */
    version: integer("version").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("character_org_slug_idx").on(t.organizationId, t.slug), index("character_org_idx").on(t.organizationId)],
);

/** Reference images: face proposals, the master portrait, and the identity pack (angles, expressions, outfits). */
export const characterReference = pgTable(
  "character_reference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => character.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ReferenceKind>().notNull(),
    label: text("label").notNull().default(""),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    /** Only approved references are sent to the image models. */
    approved: boolean("approved").notNull().default(false),
    /** Identity check against the master at generation time (null for the master and candidates). */
    check: jsonb("check").$type<{ same: boolean; score: number; issues: string }>(),
    ...timestamps,
  },
  (t) => [index("character_reference_idx").on(t.characterId, t.kind)],
);

/** One paid generation for a character (face proposals, identity pack, extra outfit or expression). */
export const characterJob = pgTable(
  "character_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => character.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").$type<CharacterJobKind>().notNull(),
    /** extra jobs: what to draw ({ kind: "outfit" | "expression", description }). */
    input: jsonb("input").$type<{ kind?: "outfit" | "expression"; description?: string }>().notNull().default({}),
    status: text("status").$type<"queued" | "running" | "completed" | "failed">().notNull().default("queued"),
    tokens: integer("tokens").notNull(),
    costUsd: real("cost_usd").notNull().default(0),
    error: text("error"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("character_job_idx").on(t.characterId, t.createdAt)],
);

/** Story memory: what happened to the character, appended after each production and by the user. */
export const characterEvent = pgTable(
  "character_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => character.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id").references(() => episode.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    ...timestamps,
  },
  (t) => [index("character_event_idx").on(t.characterId, t.createdAt), uniqueIndex("character_event_episode_idx").on(t.characterId, t.episodeId)],
);

/** Snapshot of a character each time its identity is locked, to compare versions. */
export const characterVersion = pgTable(
  "character_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => character.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").$type<{ name: string; appearance: string; personality: string; backstory: string; voiceKind: string; voiceStyle: string; masterKey: string | null; references: number }>().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("character_version_idx").on(t.characterId, t.version)],
);

/**
 * Wallet top-ups through CinetPay. The row is created before redirecting to the payment page; tokens are
 * credited once, when CinetPay's own status check says ACCEPTED for exactly this amount.
 */
export const payment = pgTable(
  "payment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    provider: text("provider").$type<"cinetpay">().notNull().default("cinetpay"),
    /** Our id sent to CinetPay as transaction_id (alphanumeric, unique). */
    transactionId: text("transaction_id").notNull().unique(),
    amountXof: integer("amount_xof").notNull(),
    tokens: integer("tokens").notNull(),
    status: text("status").$type<"pending" | "accepted" | "refused">().notNull().default("pending"),
    /** As reported by CinetPay: OM, MOMO, FLOOZ, TMONEY, WAVE, VISAM… */
    paymentMethod: text("payment_method"),
    operatorId: text("operator_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("payment_org_idx").on(t.organizationId, t.createdAt)],
);

export const userRelations = relations(user, ({ many }) => ({ memberships: many(member) }));
export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  projects: many(project),
  invitations: many(invitation),
}));
export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, { fields: [member.organizationId], references: [organization.id] }),
  user: one(user, { fields: [member.userId], references: [user.id] }),
}));
export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, { fields: [invitation.organizationId], references: [organization.id] }),
}));
export const projectRelations = relations(project, ({ one, many }) => ({
  organization: one(organization, { fields: [project.organizationId], references: [organization.id] }),
  episodes: many(episode),
  cast: many(castMember),
}));
export const castMemberRelations = relations(castMember, ({ one }) => ({
  project: one(project, { fields: [castMember.projectId], references: [project.id] }),
  character: one(character, { fields: [castMember.characterId], references: [character.id] }),
}));
export const characterRelations = relations(character, ({ many }) => ({
  references: many(characterReference),
  jobs: many(characterJob),
  events: many(characterEvent),
  versions: many(characterVersion),
  casts: many(castMember),
}));
export const characterReferenceRelations = relations(characterReference, ({ one }) => ({ character: one(character, { fields: [characterReference.characterId], references: [character.id] }) }));
export const characterJobRelations = relations(characterJob, ({ one }) => ({ character: one(character, { fields: [characterJob.characterId], references: [character.id] }) }));
export const characterEventRelations = relations(characterEvent, ({ one }) => ({ character: one(character, { fields: [characterEvent.characterId], references: [character.id] }) }));
export const characterVersionRelations = relations(characterVersion, ({ one }) => ({ character: one(character, { fields: [characterVersion.characterId], references: [character.id] }) }));
export const episodeRelations = relations(episode, ({ one, many }) => ({
  organization: one(organization, { fields: [episode.organizationId], references: [organization.id] }),
  project: one(project, { fields: [episode.projectId], references: [project.id] }),
  assets: many(asset),
  blocks: many(blockRun),
}));
export const blockRunRelations = relations(blockRun, ({ one }) => ({
  episode: one(episode, { fields: [blockRun.episodeId], references: [episode.id] }),
}));
export const assetRelations = relations(asset, ({ one }) => ({
  episode: one(episode, { fields: [asset.episodeId], references: [episode.id] }),
}));
