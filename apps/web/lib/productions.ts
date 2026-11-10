import "server-only";
import { defaultWorkflowFor, estimateContextFor, estimateWorkflow, getBlock, getWorkflow, resolveWorkflow, type WorkflowEstimate } from "@talestudio/blocks";
import { AD_DURATIONS, createEpisodeInput, formatsFor, TOKEN_COSTS, PLANS, shotEditInput, TERMINAL_STATUSES, type EpisodeStatus, type Format } from "@talestudio/core";
import { objectSize } from "@talestudio/storage";
import { z } from "zod";
import { and, asc, db, eq, inArray, schema } from "@talestudio/db";
import { urlFor } from "@talestudio/storage";
import { randomUUID } from "node:crypto";
import type { ErrorCode } from "@/i18n/config";
import { splitSources } from "@talestudio/ai";
import { castIntoProject } from "./characters";
import { cancelRun, startRedraw, startStage } from "./pipeline";
import { nextNumber } from "./projects";
import { fail, invalidInput, type Failure } from "./validation";
import type { WorkspaceContext } from "./workspace";

const ACTIVE: EpisodeStatus[] = ["queued", "scripting", "casting", "storyboarding", "animating", "voicing", "lipsyncing", "rendering"];

async function activeJobs(orgId: string) {
  const rows = await db.select({ id: schema.episode.id }).from(schema.episode).where(and(eq(schema.episode.organizationId, orgId), inArray(schema.episode.status, ACTIVE)));
  return rows.length;
}

/** Create a production under a project and start its storyboard stage. */
export async function createProduction(ws: WorkspaceContext, projectId: string, raw: unknown): Promise<{ ok: true; id: string } | Failure> {
  const parsed = createEpisodeInput.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  const input = parsed.data;
  const project = await db.query.project.findFirst({ where: and(eq(schema.project.id, projectId), eq(schema.project.organizationId, ws.org.id)) });
  if (!project) return fail(404, "not_found", "Project not found");
  const plan = PLANS[ws.org.plan];
  const clips = input.kind === "clips";
  if (clips && project.studio !== "podcast") return fail(400, "invalid_input", "Clips are a Podcast Studio feature", { fields: "kind" });
  if (clips) {
    // The upload must belong to this workspace and exist in storage.
    if (!input.sourceKey?.startsWith(`private/${ws.org.id}/uploads/`) || !input.sourceDurationSec) return fail(400, "invalid_input", "Upload a recording first", { fields: "sourceKey" });
    if ((await objectSize(input.sourceKey)) === null) return fail(400, "invalid_input", "The upload did not complete", { fields: "sourceKey" });
  } else {
    if (project.studio === "advertising" && !(AD_DURATIONS as readonly number[]).includes(input.durationSec)) return fail(400, "invalid_input", "Ad length must be 15, 30 or 45s", { fields: "durationSec" });
    if (input.durationSec > plan.maxDurationSec) return fail(402, "duration_limit", `Your plan allows productions up to ${plan.maxDurationSec}s.`, { max: plan.maxDurationSec });
  }
  if (project.studio === "journalism" && (input.sources?.length ?? 0) < 20) return fail(400, "invalid_input", "A report needs sources", { fields: "sources" });

  const wf = defaultWorkflowFor(project.studio, input.kind);
  const brief = project.brief as { formats?: Format[] } | null;
  // Chosen platforms decide the formats (the first one is the generation frame); otherwise the studio default.
  const platforms = clips ? [] : (input.platforms ?? []);
  const formats: Format[] = platforms.length ? formatsFor(platforms) : project.studio === "advertising" ? (brief?.formats ?? ["9:16"]) : ["16:9"];
  const storyboardCredits = estimateWorkflow(wf, estimateContextFor({ durationSec: input.durationSec, formats, sourceDurationSec: clips ? input.sourceDurationSec : null })).credits.storyboard;
  if (ws.org.credits < storyboardCredits) return fail(402, "insufficient_credits", "Not enough credits", { needed: storyboardCredits, have: ws.org.credits });
  if ((await activeJobs(ws.org.id)) >= plan.concurrentJobs) return fail(429, "concurrency", "Too many productions running", { max: plan.concurrentJobs });

  // Library characters (TaleStudio Characters) join the project cast with their master portrait: no new portrait.
  const characterIds = clips ? [] : await castIntoProject(ws.org.id, projectId, input.characterIds ?? []);

  // Style and language are inherited from the project so every production looks and sounds the same.
  const ep = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, projectId);
    const [row] = await tx
      .insert(schema.episode)
      .values({
        organizationId: ws.org.id,
        projectId,
        createdBy: ws.user.id,
        number,
        title: input.title,
        premise: input.premise,
        durationSec: input.durationSec,
        style: project.style,
        language: project.language,
        workflow: `${wf.id}@${wf.version}`,
        formats,
        platforms,
        characterIds,
        kind: input.kind,
        sources: project.studio === "journalism" ? input.sources : null,
        sourceKey: clips ? input.sourceKey : null,
        sourceDurationSec: clips ? input.sourceDurationSec : null,
      })
      .returning({ id: schema.episode.id, workflow: schema.episode.workflow });
    await tx.update(schema.project).set({ updatedAt: new Date() }).where(eq(schema.project.id, projectId));
    return row!;
  });
  const workflowId = await startStage(ep.id, ep.workflow, "storyboard", 0);
  await db.update(schema.episode).set({ workflowId }).where(eq(schema.episode.id, ep.id));
  return { ok: true, id: ep.id };
}

async function ownEpisode(orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return db.query.episode.findFirst({ where: and(eq(schema.episode.id, id), eq(schema.episode.organizationId, orgId)) });
}

/** Approve the storyboard (or retry a failed production): reserve production credits and run it. */
export async function approveProduction(ws: WorkspaceContext, id: string, raw: unknown = {}): Promise<{ ok: true } | Failure> {
  const ep = await ownEpisode(ws.org.id, id);
  if (!ep) return fail(404, "not_found", "Not found");
  // Journalism: a named editor must take responsibility for publishing the checked report.
  if (ep.claims && !z.object({ signOff: z.literal(true) }).safeParse(raw).success) return fail(400, "signoff_required", "Editorial sign-off is required");
  if (ep.kind === "clips" && !(ep.highlights ?? []).some((h) => h.selected !== false)) return fail(400, "no_highlights_selected", "Select at least one moment");
  const retry = (ep.status === "failed" || ep.status === "canceled") && ep.approvedAt;
  if (ep.status !== "storyboard_ready" && !retry) return fail(409, "not_editable", "Only a ready storyboard (or a failed production) can be approved");
  const estimate = estimateWorkflow(getWorkflow(ep.workflow), estimateContextFor(ep));
  if (ws.org.credits < estimate.credits.production) return fail(402, "insufficient_credits", "Not enough credits", { needed: estimate.credits.production, have: ws.org.credits });
  if ((await activeJobs(ws.org.id)) >= PLANS[ws.org.plan].concurrentJobs) return fail(429, "concurrency", "Too many productions running", { max: PLANS[ws.org.plan].concurrentJobs });

  // Conditional update = one approval wins even on double-click; the attempt number keys the credit reservation.
  const [row] = await db
    .update(schema.episode)
    .set({ status: "queued", error: null, approvedAt: new Date(), approvedBy: ws.user.id, productionAttempts: ep.productionAttempts + 1 })
    .where(and(eq(schema.episode.id, id), eq(schema.episode.productionAttempts, ep.productionAttempts)))
    .returning({ attempts: schema.episode.productionAttempts });
  if (!row) return fail(409, "not_editable", "Already approved");
  const workflowId = await startStage(id, ep.workflow, "production", row.attempts);
  await db.update(schema.episode).set({ workflowId }).where(eq(schema.episode.id, id));
  return { ok: true };
}

/**
 * Relaunch a failed or canceled run from where it stopped. Steps that finished keep their output (every
 * activity skips work already saved), so only the missing part runs. The stage's credits are reserved again
 * under a new attempt key; the failed attempt was already refunded.
 */
export async function retryProduction(ws: WorkspaceContext, id: string, raw: unknown = {}): Promise<{ ok: true } | Failure> {
  const ep = await ownEpisode(ws.org.id, id);
  if (!ep) return fail(404, "not_found", "Not found");
  if (ep.status !== "failed" && ep.status !== "canceled") return fail(409, "not_editable", "Only a failed or canceled production can be relaunched");
  // Failed after approval: the production stage reruns (same checks as approving).
  if (ep.approvedAt) return approveProduction(ws, id, raw);

  const estimate = estimateWorkflow(getWorkflow(ep.workflow), estimateContextFor(ep));
  if (ws.org.credits < estimate.credits.storyboard) return fail(402, "insufficient_credits", "Not enough credits", { needed: estimate.credits.storyboard, have: ws.org.credits });
  if ((await activeJobs(ws.org.id)) >= PLANS[ws.org.plan].concurrentJobs) return fail(429, "concurrency", "Too many productions running", { max: PLANS[ws.org.plan].concurrentJobs });
  const [row] = await db
    .update(schema.episode)
    .set({ status: "queued", error: null, completedAt: null, productionAttempts: ep.productionAttempts + 1 })
    .where(and(eq(schema.episode.id, id), eq(schema.episode.productionAttempts, ep.productionAttempts), inArray(schema.episode.status, ["failed", "canceled"])))
    .returning({ attempts: schema.episode.productionAttempts });
  if (!row) return fail(409, "not_editable", "Already relaunched");
  const workflowId = await startStage(id, ep.workflow, "storyboard", row.attempts);
  await db.update(schema.episode).set({ workflowId }).where(eq(schema.episode.id, id));
  return { ok: true };
}

/** Storyboard edits are only allowed before approval — after that, the clips depend on them. */
const editable = (ep: { status: EpisodeStatus; approvedAt: Date | null }) => ep.status === "storyboard_ready" && !ep.approvedAt;

export async function editShot(ws: WorkspaceContext, id: string, index: number, raw: unknown): Promise<{ ok: true } | Failure> {
  const parsed = shotEditInput.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  const ep = await ownEpisode(ws.org.id, id);
  if (!ep?.script?.shots[index]) return fail(404, "not_found", "Shot not found");
  if (!editable(ep)) return fail(409, "not_editable", "The storyboard is locked once approved");
  const script = structuredClone(ep.script);
  Object.assign(script.shots[index]!, Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)));
  if (script.shots[index]!.line === null || script.shots[index]!.line === "") script.shots[index]!.line = null;
  await db.update(schema.episode).set({ script }).where(eq(schema.episode.id, id));
  return { ok: true };
}

/** Podcast to Clips: choose which detected moments become clips (before approval). */
export async function selectHighlights(ws: WorkspaceContext, id: string, raw: unknown): Promise<{ ok: true } | Failure> {
  const parsed = z.object({ selected: z.array(z.number().int().min(0)).max(50) }).safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  const ep = await ownEpisode(ws.org.id, id);
  if (!ep?.highlights) return fail(404, "not_found", "No highlights");
  if (!editable(ep)) return fail(409, "not_editable", "Locked once approved");
  const keep = new Set(parsed.data.selected);
  await db.update(schema.episode).set({ highlights: ep.highlights.map((h, i) => ({ ...h, selected: keep.has(i) })) }).where(eq(schema.episode.id, id));
  return { ok: true };
}

export async function redrawShot(ws: WorkspaceContext, id: string, index: number): Promise<{ ok: true } | Failure> {
  const ep = await ownEpisode(ws.org.id, id);
  if (!ep?.script?.shots[index]) return fail(404, "not_found", "Shot not found");
  if (!editable(ep)) return fail(409, "not_editable", "The storyboard is locked once approved");
  if (ws.org.credits < TOKEN_COSTS.keyframeRedraw) return fail(402, "insufficient_credits", "Not enough tokens", { needed: TOKEN_COSTS.keyframeRedraw, have: ws.org.credits });
  await startRedraw(id, index, randomUUID());
  return { ok: true };
}

export async function cancelProduction(ws: WorkspaceContext, id: string): Promise<{ ok: true } | Failure> {
  const ep = await ownEpisode(ws.org.id, id);
  if (!ep) return fail(404, "not_found", "Not found");
  if (TERMINAL_STATUSES.includes(ep.status)) return fail(409, "already_finished", "Already finished");
  if (!ep.workflowId || !(await cancelRun(ep.workflowId))) return fail(409, "cannot_cancel_inline", "Inline dev runs cannot be cancelled");
  return { ok: true }; // the workflow's compensation refunds and sets status=canceled
}

/** Pipeline errors are stored as raw messages; map them to a translatable code for display. */
function classifyError(status: EpisodeStatus, raw: string | null): Extract<ErrorCode, "no_credits" | "upgrade_required" | "script_refused" | "pipeline_failed" | "recording_too_long" | "recording_unreadable"> | null {
  if (status !== "failed") return null;
  const m = raw ?? "";
  if (/Insufficient credits/i.test(m)) return "no_credits";
  if (/paid plan|allows (episodes|productions) up to/i.test(m)) return "upgrade_required";
  if (/declined/i.test(m)) return "script_refused";
  if (/longer than the declared/i.test(m)) return "recording_too_long";
  if (/could not be read|No speech found/i.test(m)) return "recording_unreadable";
  return "pipeline_failed";
}

/** Production + signed asset URLs + block states + price, scoped to the workspace. Shared by the page and the polling endpoint. */
export async function getProductionView(orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const ep = await db.query.episode.findFirst({
    where: and(eq(schema.episode.id, id), eq(schema.episode.organizationId, orgId)),
    with: {
      assets: { orderBy: asc(schema.asset.createdAt) },
      blocks: true,
      project: { columns: { id: true, title: true, studio: true, brief: true }, with: { cast: true } },
    },
  });
  if (!ep) return null;

  const byKind = async (kind: (typeof ep.assets)[number]["kind"]) =>
    Object.fromEntries(await Promise.all(ep.assets.filter((a) => a.kind === kind).map(async (a) => [a.ref, { url: await urlFor(a.storageKey), contentType: a.contentType, check: a.check }] as const)));

  const wf = getWorkflow(ep.workflow);
  const nodes = resolveWorkflow(wf);
  const estimate: WorkflowEstimate = estimateWorkflow(wf, estimateContextFor(ep));
  const runs = new Map(ep.blocks.map((b) => [b.nodeId, b]));

  return {
    id: ep.id,
    number: ep.number,
    project: { id: ep.project.id, title: ep.project.title, studio: ep.project.studio },
    title: ep.title,
    premise: ep.premise,
    style: ep.style,
    durationSec: ep.durationSec,
    status: ep.status,
    progress: ep.progress,
    error: ep.status === "failed" ? ep.error : null,
    errorCode: classifyError(ep.status, ep.error),
    script: ep.script,
    approvedAt: ep.approvedAt?.toISOString() ?? null,
    kind: ep.kind,
    claims: ep.claims,
    sourcesList: ep.sources ? splitSources(ep.sources) : [],
    highlights: ep.highlights,
    transcriptPreview: ep.transcript?.slice(0, 400) ?? null,
    sourceDurationSec: ep.sourceDurationSec,
    /** Podcast to Clips exports, by highlight index. */
    socialClips: Object.fromEntries(await Promise.all(Object.entries(ep.clips).map(async ([i, key]) => [i, await urlFor(key)] as const))) as Record<string, string>,
    editable: editable(ep),
    createdAt: ep.createdAt.toISOString(),
    done: TERMINAL_STATUSES.includes(ep.status),
    formats: ep.formats,
    platforms: ep.platforms,
    /** Failed or canceled runs can be relaunched from the step that stopped. */
    retryable: ep.status === "failed" || ep.status === "canceled",
    estimate: { storyboard: estimate.credits.storyboard, production: estimate.credits.production },
    pipeline: wf.stages.flatMap((stage) =>
      stage.nodes.map((nodeId) => {
        const n = nodes.get(nodeId)!;
        const run = runs.get(nodeId);
        return {
          nodeId,
          stage: stage.id,
          block: n.block,
          version: n.version,
          category: n.def.category,
          providers: getBlock(n.block, n.version).providers.map((p) => p.label),
          credits: estimate.byNode.find((b) => b.id === nodeId)?.credits ?? 0,
          status: run?.status ?? "pending",
          itemsDone: run?.itemsDone ?? 0,
          itemsTotal: run?.itemsTotal ?? 0,
        };
      }),
    ),
    renders: Object.fromEntries(await Promise.all(Object.entries(ep.renders).map(async ([f, key]) => [f, await urlFor(key!)] as const))) as Partial<Record<Format, string>>,
    thumbnailUrl: ep.thumbnailKey ? await urlFor(ep.thumbnailKey) : null,
    characters: Object.fromEntries(
      await Promise.all(ep.project.cast.filter((c) => c.imageKey).map(async (c) => [c.slug, { url: await urlFor(c.imageKey!), contentType: "image" }] as const)),
    ),
    keyframes: await byKind("keyframe"),
    clips: await byKind("lipsync").then(async (ls) => ({ ...(await byKind("clip")), ...ls })),
  };
}
export type ProductionView = NonNullable<Awaited<ReturnType<typeof getProductionView>>>;
