import { buildSrt, characterPrompt, clipSrt, createProviders, cutClip, ffmpegAvailable, probeDuration, referencePrompt, renderEpisode, voiceKind, type GeneratedAsset, type Providers, type RenderClip } from "@talestudio/ai";
import { estimateContextFor, estimateWorkflow, getBlock, getWorkflow, type Executor, type FanOut, type Stage } from "@talestudio/blocks";
import { IDENTITY_PACK, MAX_NEW_PORTRAITS, MAX_REFS_PER_CHARACTER, PLANS, TERMINAL_STATUSES, TOKEN_COSTS, tokensForCost, type EpisodeStatus, type Script, type Style } from "@talestudio/core";
import { and, applyCredits, asc, db, desc, eq, inArray, schema, sql } from "@talestudio/db";
import { getObjectBytes, keys, putFromUrl, putObject, urlFor } from "@talestudio/storage";
import { NonRetryableError, PlanLimitError } from "./errors";

type AssetKind = (typeof schema.asset.$inferInsert)["kind"];

const EXT: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
};

/**
 * One reservation per stage run. `attempt` is the episode's run counter (bumped by every approval and every
 * relaunch), so a relaunch is charged again and refunded on its own. Attempt 0 keeps the original storyboard key.
 */
export const reserveKey = (episodeId: string, stage: Stage, attempt: number) =>
  stage === "storyboard" ? `reserve:${episodeId}:storyboard${attempt ? `:${attempt}` : ""}` : `reserve:${episodeId}:production:${attempt}`;

export function createActivities(providers: Providers = createProviders()) {
  async function loadEpisode(id: string) {
    const ep = await db.query.episode.findFirst({ where: eq(schema.episode.id, id), with: { organization: true, project: true } });
    if (!ep) throw new NonRetryableError(`episode ${id} not found`);
    return ep;
  }
  type LoadedEpisode = Awaited<ReturnType<typeof loadEpisode>>;

  function requireScript(ep: { script: Script | null; id: string }): Script {
    if (!ep.script) throw new NonRetryableError(`episode ${ep.id} has no script yet`);
    return ep.script;
  }

  async function findAsset(episodeId: string, kind: AssetKind, ref: string) {
    return db.query.asset.findFirst({ where: and(eq(schema.asset.episodeId, episodeId), eq(schema.asset.kind, kind), eq(schema.asset.ref, ref)) });
  }

  /** Persist a provider output under raw/ (expiring) and record it. Idempotent on (episode, kind, ref). */
  async function saveAsset(ep: LoadedEpisode, kind: AssetKind, ref: string, out: GeneratedAsset) {
    const retentionDays = PLANS[ep.organization.plan].rawRetentionDays as 7 | 14;
    const key = keys.raw(ep.id, kind, `${ref}-${Date.now().toString(36)}`, EXT[out.contentType] ?? "bin");
    if (out.bytes) await putObject({ key, body: out.bytes, contentType: out.contentType, retentionDays });
    else if (out.url) await putFromUrl(out.url, { key, contentType: out.contentType, retentionDays });
    else throw new Error(`${out.provider} returned neither bytes nor url`);

    await db.transaction(async (tx) => {
      await tx
        .insert(schema.asset)
        .values({ episodeId: ep.id, kind, ref, storageKey: key, contentType: out.contentType, provider: out.provider, costUsd: out.costUsd, expiresAt: new Date(Date.now() + retentionDays * 86_400_000) })
        .onConflictDoNothing();
      await addCost(ep.id, out.costUsd, tx);
    });
    return key;
  }

  /** Net tokens that earlier attempts of a stage kept (reserved minus refunded), excluding the current reservation. */
  async function keptByEarlierAttempts(episodeId: string, stage: Stage, currentKey: string) {
    const prefix = `reserve:${episodeId}:${stage}`;
    const rows = await db
      .select({ delta: schema.creditLedger.delta, key: schema.creditLedger.idempotencyKey })
      .from(schema.creditLedger)
      .where(and(eq(schema.creditLedger.episodeId, episodeId), sql`(${schema.creditLedger.idempotencyKey} like ${`${prefix}%`} or ${schema.creditLedger.idempotencyKey} like ${`refund:${prefix}%`})`));
    return -rows.filter((r) => r.key !== currentKey && r.key !== `refund:${currentKey}`).reduce((sum, r) => sum + r.delta, 0);
  }

  /** Story memory: once a production is completed, each library character in it remembers the episode. */
  async function rememberEpisode(episodeId: string) {
    const ep = await loadEpisode(episodeId);
    if (!ep.script) return;
    const text = `${ep.project.title} · ${ep.title}: ${ep.script.logline}`;
    const linked = (await projectCast(ep.projectId)).filter((c) => c.characterId && ep.script!.characters.some((s) => s.id === c.slug));
    if (linked.length) await db.insert(schema.characterEvent).values(linked.map((c) => ({ characterId: c.characterId!, episodeId, text }))).onConflictDoNothing();
  }

  async function addCost(episodeId: string, usd: number, tx: Pick<typeof db, "update"> = db) {
    if (!usd) return;
    await tx.update(schema.episode).set({ costUsd: sql`${schema.episode.costUsd} + ${usd}` }).where(eq(schema.episode.id, episodeId));
  }

  /** The project's cast, with each member's library character (approved references, recent story memory). */
  const projectCast = (projectId: string) =>
    db.query.castMember.findMany({
      where: eq(schema.castMember.projectId, projectId),
      orderBy: [asc(schema.castMember.createdAt), asc(schema.castMember.slug)],
      with: {
        character: {
          with: {
            references: { where: eq(schema.characterReference.approved, true), orderBy: asc(schema.characterReference.createdAt) },
            events: { orderBy: desc(schema.characterEvent.createdAt), limit: 8 },
          },
        },
      },
    });
  type CastRow = Awaited<ReturnType<typeof projectCast>>[number];

  /** Library identity wins over the project copy: a locked persona must look and sound the same everywhere. */
  const identity = (c: CastRow) => ({
    id: c.slug,
    name: c.character?.name ?? c.name,
    appearance: c.character?.appearance ?? c.appearance,
    voice: c.character?.voiceStyle || c.voice,
    bio: c.bio ?? "",
  });

  /** A new character invented by the script lands in the workspace library (draft) and is linked to the cast. */
  async function addToLibrary(orgId: string, c: { id: string; slug: string; name: string; appearance: string; voice: string; bio: string | null }, style: Style) {
    for (const slug of [c.slug, `${c.slug}-${c.id.slice(0, 4)}`]) {
      const [row] = await db
        .insert(schema.character)
        .values({ organizationId: orgId, slug, name: c.name, style, appearance: c.appearance, backstory: c.bio ?? "", voiceKind: voiceKind(c.voice), voiceStyle: c.voice })
        .onConflictDoNothing()
        .returning({ id: schema.character.id });
      if (row) {
        await db.update(schema.castMember).set({ characterId: row.id }).where(eq(schema.castMember.id, c.id));
        return row.id;
      }
    }
    return null;
  }

  /**
   * Check a generated keyframe against the master portrait of the first library character in the shot.
   * The verdict is shown on the frame; a mismatch is fixed by a (paid) redraw, never silently.
   */
  async function checkIdentity(episodeId: string, assetKey: string, ref: string, members: CastRow[]) {
    const member = members.find((m) => m.character?.masterKey);
    if (!member?.character?.masterKey) return;
    const out = await providers.identity.check({ referenceUrl: await fetchUrl(member.character.masterKey), candidateUrl: await fetchUrl(assetKey), name: member.character.name });
    await db
      .update(schema.asset)
      .set({ check: { same: out.same, score: out.score, issues: out.issues, character: member.character.name } })
      .where(and(eq(schema.asset.episodeId, episodeId), eq(schema.asset.kind, "keyframe"), eq(schema.asset.ref, ref)));
    await addCost(episodeId, out.costUsd);
  }

  /** Providers need fetchable URLs for reference inputs; signed URLs are enough (and work with LocalStack). */
  const fetchUrl = (key: string) => urlFor(key, 6 * 3600);

  /* ─────────────── Block executors: one call = one item of a block ─────────────── */

    /** Config of a workflow node, for executors whose behaviour is configurable (clip count, format). */
  const nodeConfig = (workflowKey: string, nodeId: string) => (getWorkflow(workflowKey).nodes.find((n) => n.id === nodeId)?.config ?? {}) as Record<string, unknown>;
  const AUDIO_EXT = /\.(mp3|m4a|wav|aac|ogg|opus|flac)$/i;

  const executors: Record<Executor, (episodeId: string, item: number, nodeId: string) => Promise<void>> = {
    async writeScript(episodeId) {
      const ep = await loadEpisode(episodeId);
      if (ep.script) return;
      const cast = await projectCast(ep.projectId);
      const earlier = await db.query.episode.findMany({
        where: and(eq(schema.episode.projectId, ep.projectId), sql`${schema.episode.number} < ${ep.number}`, inArray(schema.episode.status, ["completed", "storyboard_ready"])),
        orderBy: desc(schema.episode.number),
        limit: 8, // enough continuity without bloating the prompt
        columns: { number: true, title: true, script: true, premise: true },
      });
      const wf = getWorkflow(ep.workflow);
      const scriptNode = wf.nodes.find((n) => n.block === "story.script");
      const format = (scriptNode?.config?.format as "episode" | "ad" | "podcast" | "news" | undefined) ?? "episode";
      if (format === "news" && !ep.claims) throw new NonRetryableError("A news script needs the fact-check first");
      const out = await providers.script.write({
        ...ep,
        format,
        brief: ep.project.brief,
        claims: ep.claims,
        project: {
          title: ep.project.title,
          description: ep.project.description,
          characters: cast.map((c) => ({
            ...identity(c),
            personality: c.character?.personality || undefined,
            memory: c.character?.events.map((e) => e.text).reverse(),
            locked: c.character?.status === "locked",
          })),
          previously: earlier.reverse().map((e) => ({ number: e.number, title: e.title, logline: e.script?.logline ?? e.premise })),
        },
        featured: cast.filter((c) => c.characterId && ep.characterIds.includes(c.characterId)).map((c) => c.slug),
      });
      const script = out.script;
      // The project's cast wins over whatever the model wrote for a recurring character: that's what keeps them consistent.
      const bySlug = new Map(cast.map((c) => [c.slug, identity(c)]));
      script.characters = script.characters.map((c) => {
        const known = bySlug.get(c.id);
        return known ? { ...known, bio: known.bio || c.bio } : c;
      });
      await db.update(schema.episode).set({ script }).where(eq(schema.episode.id, episodeId));
      await addCost(episodeId, out.costUsd);
    },

    /** Project-level casting: a portrait is generated once, then reused by every production. */
    async castCharacters(episodeId) {
      const ep = await loadEpisode(episodeId);
      const script = requireScript(ep);
      if (script.characters.length) {
        await db
          .insert(schema.castMember)
          .values(script.characters.map((c) => ({ projectId: ep.projectId, slug: c.id, name: c.name, appearance: c.appearance, voice: c.voice, bio: c.bio, introducedIn: ep.id })))
          .onConflictDoNothing();
      }
      // The storyboard base price covers up to MAX_NEW_PORTRAITS; extra characters are drawn without a reference.
      let portraits = 0;
      for (const c of await projectCast(ep.projectId)) {
        if (!script.characters.some((s) => s.id === c.slug)) continue;
        const characterId = c.characterId ?? (await addToLibrary(ep.organizationId, c, ep.style));
        if (c.imageKey) continue;
        // A library character with a master portrait costs nothing to cast: reuse it.
        if (c.character?.masterKey) {
          await db.update(schema.castMember).set({ imageKey: c.character.masterKey }).where(and(eq(schema.castMember.id, c.id), sql`${schema.castMember.imageKey} is null`));
          continue;
        }
        if (portraits++ >= MAX_NEW_PORTRAITS) break;
        const out = await providers.image.character({ id: c.slug, name: c.name, appearance: c.appearance, voice: c.voice, bio: c.bio ?? "" }, ep.style);
        const key = keys.project(ep.organizationId, ep.projectId, `cast/${c.slug}.${EXT[out.contentType] ?? "bin"}`);
        if (out.bytes) await putObject({ key, body: out.bytes, contentType: out.contentType });
        else if (out.url) await putFromUrl(out.url, { key, contentType: out.contentType });
        // Conditional update: if two productions race on the same new character, only the first portrait is kept.
        await db.update(schema.castMember).set({ imageKey: key }).where(and(eq(schema.castMember.id, c.id), sql`${schema.castMember.imageKey} is null`));
        if (characterId) {
          // The portrait becomes the library character's master, unless it already has one.
          const [set] = await db.update(schema.character).set({ masterKey: key }).where(and(eq(schema.character.id, characterId), sql`${schema.character.masterKey} is null`)).returning({ id: schema.character.id });
          if (set) await db.insert(schema.characterReference).values({ characterId, kind: "master", label: "master", storageKey: key, contentType: out.contentType, approved: true });
        }
        await addCost(episodeId, out.costUsd);
      }
    },

    async drawKeyframe(episodeId, shotIndex) {
      const ep = await loadEpisode(episodeId);
      const script = requireScript(ep);
      const ref = String(shotIndex);
      if (await findAsset(episodeId, "keyframe", ref)) return;
      const shot = script.shots[shotIndex];
      if (!shot) throw new NonRetryableError(`shot ${shotIndex} missing`);
      const cast = new Map((await projectCast(ep.projectId)).map((c) => [c.slug, c]));
      const inShot = script.characters.filter((c) => shot.characterIds.includes(c.id));
      const refs = await Promise.all(
        inShot.map(async (character) => {
          const member = cast.get(character.id);
          const imageKey = member?.character?.masterKey ?? member?.imageKey;
          if (!imageKey) return null;
          // Master first, then the best approved references: angles before outfits and expressions.
          const order = { angle: 0, outfit: 1, expression: 2 } as Record<string, number>;
          const extras = (member?.character?.references ?? [])
            .filter((r) => r.storageKey !== imageKey && r.kind in order)
            .sort((a, b) => order[a.kind]! - order[b.kind]!)
            .slice(0, MAX_REFS_PER_CHARACTER - 1);
          return { character, imageUrl: await fetchUrl(imageKey), extraUrls: await Promise.all(extras.map((r) => fetchUrl(r.storageKey))) };
        }),
      );
      const key = await saveAsset(ep, "keyframe", ref, await providers.image.keyframe(shot, ep.style, refs.filter((r) => r !== null), ep.formats[0] ?? "16:9"));
      await checkIdentity(episodeId, key, ref, inShot.map((c) => cast.get(c.id)).filter((m): m is CastRow => Boolean(m?.character)));
    },

    async animateShot(episodeId, shotIndex) {
      const ep = await loadEpisode(episodeId);
      const shot = requireScript(ep).shots[shotIndex]!;
      const ref = String(shotIndex);
      if (await findAsset(episodeId, "clip", ref)) return;
      const keyframe = await findAsset(episodeId, "keyframe", ref);
      if (!keyframe) throw new Error(`keyframe ${shotIndex} missing`);
      const out = await providers.video.animate({ imageUrl: await fetchUrl(keyframe.storageKey), prompt: `${shot.visual}. ${shot.camera}`, durationSec: shot.durationSec, aspect: ep.formats[0] ?? "16:9" });
      await saveAsset(ep, "clip", ref, out);
    },

    async voiceShot(episodeId, shotIndex) {
      const ep = await loadEpisode(episodeId);
      const script = requireScript(ep);
      const shot = script.shots[shotIndex]!;
      const ref = String(shotIndex);
      if (!shot.line || (await findAsset(episodeId, "audio", ref))) return;
      const speaker = script.characters.find((c) => c.id === shot.speakerId);
      // A library character always speaks with its own voice.
      const library = speaker ? (await projectCast(ep.projectId)).find((c) => c.slug === speaker.id)?.character : undefined;
      const out = await providers.speech.speak({ text: shot.line, voice: library?.voiceStyle || speaker?.voice || "narrator", language: ep.language, preset: library?.voiceKind });
      await saveAsset(ep, "audio", ref, out);
    },

    async lipsyncShot(episodeId, shotIndex) {
      const ep = await loadEpisode(episodeId);
      const shot = requireScript(ep).shots[shotIndex]!;
      const ref = String(shotIndex);
      // Narration is laid over the clip; only on-camera speakers need lip-sync.
      if (!shot.speakerId || (await findAsset(episodeId, "lipsync", ref))) return;
      const [clip, audio] = await Promise.all([findAsset(episodeId, "clip", ref), findAsset(episodeId, "audio", ref)]);
      if (!clip || !audio || clip.contentType !== "video/mp4") return; // mock mode: stills can't be lip-synced
      const out = await providers.lipsync.sync({ videoUrl: await fetchUrl(clip.storageKey), audioUrl: await fetchUrl(audio.storageKey) });
      await saveAsset(ep, "lipsync", ref, out);
    },

    /** One render per output format (16:9, 9:16, 1:1) from the same clips. */
    async renderFinal(episodeId, formatIndex) {
      const ep = await loadEpisode(episodeId);
      const format = ep.formats[formatIndex] ?? "16:9";
      if (ep.renders[format]) return;
      const script = requireScript(ep);
      const srt = buildSrt(script.shots);
      await putObject({ key: keys.final(ep.organizationId, ep.id, "subtitles.srt"), body: srt, contentType: "application/x-subrip" });

      const clips: RenderClip[] = [];
      for (const shot of script.shots) {
        const ref = String(shot.index);
        const video = (await findAsset(episodeId, "lipsync", ref)) ?? (await findAsset(episodeId, "clip", ref));
        if (!video) throw new Error(`no clip for shot ${shot.index}`);
        // ffmpeg can't decode SVG (fallback mock frames when ffmpeg was missing): preview-only production.
        if (video.contentType === "image/svg+xml") return;
        const audio = shot.speakerId ? null : await findAsset(episodeId, "audio", ref); // lip-synced clips already carry audio
        const voice = audio ? await getObjectBytes(audio.storageKey) : undefined;
        clips.push({
          kind: video.contentType.startsWith("video/") ? "video" : "image",
          ext: EXT[video.contentType] ?? "jpg",
          durationSec: shot.durationSec,
          bytes: await getObjectBytes(video.storageKey),
          audio: voice?.length ? voice : undefined, // empty = mock voice: silent track
        });
      }
      if (!(await ffmpegAvailable())) throw new Error("ffmpeg is not installed on this worker");

      const { video, thumbnail } = await renderEpisode({ clips, srt, watermark: PLANS[ep.organization.plan].watermark, format });
      const slug = format.replace(":", "x");
      const key = await putObject({ key: keys.final(ep.organizationId, ep.id, `${slug}.mp4`), body: video, contentType: "video/mp4" });
      const thumbKey = ep.thumbnailKey ?? (await putObject({ key: keys.final(ep.organizationId, ep.id, "thumbnail.jpg"), body: thumbnail, contentType: "image/jpeg" }));
      await db
        .update(schema.episode)
        .set({ renders: sql`${schema.episode.renders} || ${JSON.stringify({ [format]: key })}::jsonb`, thumbnailKey: thumbKey })
        .where(eq(schema.episode.id, episodeId));
    },

    /** Journalism: extract claims and check them against the newsroom's sources only. */
    async checkFacts(episodeId) {
      const ep = await loadEpisode(episodeId);
      if (ep.claims) return;
      if (!ep.sources?.trim()) throw new NonRetryableError("A report needs sources to be checked against");
      const out = await providers.factCheck.check({ premise: ep.premise, sources: ep.sources, language: ep.language });
      await db.update(schema.episode).set({ claims: out.claims }).where(eq(schema.episode.id, episodeId));
      await addCost(episodeId, out.costUsd);
    },

    /** Podcast to Clips: transcribe the uploaded recording (after checking its real length). */
    async transcribe(episodeId) {
      const ep = await loadEpisode(episodeId);
      if (ep.transcript) return;
      if (!ep.sourceKey || !ep.sourceDurationSec) throw new NonRetryableError("No recording uploaded");
      const url = await fetchUrl(ep.sourceKey);
      const real = await probeDuration(url);
      if (real === null) throw new NonRetryableError("The recording could not be read");
      // Credits were reserved on the declared length: refuse a recording much longer than declared.
      if (real > ep.sourceDurationSec * 1.1 + 5) throw new NonRetryableError(`Recording is ${Math.round(real)}s, longer than the declared ${ep.sourceDurationSec}s`);
      const out = await providers.transcriber.transcribe({ audioUrl: url, language: ep.language, durationSec: real });
      if (!out.segments.length) throw new NonRetryableError("No speech found in the recording");
      await db.update(schema.episode).set({ transcript: out.segments }).where(eq(schema.episode.id, episodeId));
      await addCost(episodeId, out.costUsd);
    },

    async findHighlights(episodeId, _item, nodeId) {
      const ep = await loadEpisode(episodeId);
      if (ep.highlights) return;
      if (!ep.transcript) throw new NonRetryableError("Transcript missing");
      const count = Number(nodeConfig(ep.workflow, nodeId).count ?? 6);
      const out = await providers.highlights.find({ segments: ep.transcript, count, language: ep.language, context: `${ep.project.title}. ${ep.project.description}. ${ep.premise}` });
      await db.update(schema.episode).set({ highlights: out.highlights.map((h) => ({ ...h, selected: true })) }).where(eq(schema.episode.id, episodeId));
      await addCost(episodeId, out.costUsd);
    },

    /** Cut one highlight into a vertical clip with burned subtitles, reading the source by HTTP range. */
    async cutClip(episodeId, index, nodeId) {
      const ep = await loadEpisode(episodeId);
      if (ep.clips[String(index)]) return;
      const h = ep.highlights?.[index];
      if (!h || !ep.sourceKey || !ep.transcript) throw new NonRetryableError(`highlight ${index} missing`);
      const format = String(nodeConfig(ep.workflow, nodeId).format ?? "9:16");
      const bytes = await cutClip({
        sourceUrl: await fetchUrl(ep.sourceKey),
        start: h.start,
        end: h.end,
        srt: clipSrt(ep.transcript, h.start, h.end),
        format,
        audioOnly: AUDIO_EXT.test(ep.sourceKey),
      });
      const key = await putObject({ key: keys.final(ep.organizationId, ep.id, `clip-${index + 1}.mp4`), body: bytes, contentType: "video/mp4" });
      await db
        .update(schema.episode)
        .set({ clips: sql`${schema.episode.clips} || ${JSON.stringify({ [String(index)]: key })}::jsonb` })
        .where(eq(schema.episode.id, episodeId));
    },
  };

  return {
    /* ─────────────── Engine bookkeeping ─────────────── */

    /** Check plan limits and reserve the stage's credits (production is priced on the real script). */
    async reserveStage(episodeId: string, stage: Stage) {
      const ep = await loadEpisode(episodeId);
      const plan = PLANS[ep.organization.plan];
      if (stage === "production" && !plan.canGenerateVideo) throw new PlanLimitError("Video generation requires a paid plan. The free plan includes storyboards.");
      if (ep.durationSec > plan.maxDurationSec) throw new PlanLimitError(`Your plan allows episodes up to ${plan.maxDurationSec}s.`);
      const estimate = estimateWorkflow(getWorkflow(ep.workflow), estimateContextFor(ep));
      const key = reserveKey(episodeId, stage, ep.productionAttempts);
      // A relaunch only charges what earlier failed attempts of this stage have not already paid for.
      const credits = Math.max(0, estimate.credits[stage] - (await keptByEarlierAttempts(episodeId, stage, key)));
      if (credits > 0) await applyCredits({ organizationId: ep.organizationId, actorId: ep.approvedBy ?? ep.createdBy, delta: -credits, reason: "episode_reserve", episodeId, idempotencyKey: key });
      return { key, credits, concurrency: Math.min(4, plan.concurrentJobs * 2), costUsd: ep.costUsd };
    },

    /**
     * Give back what a reservation took, minus the provider cost (at cost price) of what this attempt already
     * generated since `costAtReserveUsd`. Those assets are kept and reused by a relaunch, which deducts what was
     * kept here, so a customer never pays twice and we never pay for work nobody paid for. Idempotent per reservation.
     */
    async refundReservation(episodeId: string, key: string, costAtReserveUsd?: number) {
      const row = await db.query.creditLedger.findFirst({ where: eq(schema.creditLedger.idempotencyKey, key) });
      if (!row || row.delta >= 0) return;
      let kept = 0;
      if (costAtReserveUsd !== undefined) {
        const ep = await db.query.episode.findFirst({ where: eq(schema.episode.id, episodeId), columns: { costUsd: true } });
        kept = Math.min(-row.delta, tokensForCost((ep?.costUsd ?? 0) - costAtReserveUsd));
      }
      const refund = -row.delta - kept;
      if (refund > 0) await applyCredits({ organizationId: row.organizationId, delta: refund, reason: "episode_refund", episodeId, idempotencyKey: `refund:${key}` });
    },

    async setStatus(episodeId: string, status: EpisodeStatus, progress: number) {
      await db.update(schema.episode).set({ status, progress }).where(eq(schema.episode.id, episodeId));
    },

    async finish(episodeId: string, status: EpisodeStatus, error?: string) {
      if (!TERMINAL_STATUSES.includes(status)) throw new Error(`${status} is not terminal`);
      await db
        .update(schema.episode)
        .set({ status, progress: status === "failed" || status === "canceled" ? undefined : 1, error: error ?? null, completedAt: new Date() })
        .where(eq(schema.episode.id, episodeId));
      if (status === "completed") await rememberEpisode(episodeId);
    },

    /** Mark a block running and return the items it must process (one per shot, format…). */
    async startBlock(episodeId: string, node: { nodeId: string; block: string; version: number; stage: Stage }) {
      const ep = await loadEpisode(episodeId);
      const fanOut: FanOut = getBlock(node.block, node.version).fanOut;
      const shots = ep.script?.shots ?? [];
      const items =
        fanOut === "once" ? [0]
        : fanOut === "shots" ? shots.map((s) => s.index)
        : fanOut === "spokenShots" ? shots.filter((s) => s.line).map((s) => s.index)
        : fanOut === "onCameraShots" ? shots.filter((s) => s.speakerId).map((s) => s.index)
        : fanOut === "highlights" ? (ep.highlights ?? []).flatMap((h, i) => (h.selected === false ? [] : [i]))
        : ep.formats.map((_, i) => i);
      await db
        .insert(schema.blockRun)
        .values({ episodeId, nodeId: node.nodeId, block: node.block, blockVersion: node.version, stage: node.stage, status: "running", itemsTotal: items.length, itemsDone: 0, startedAt: new Date() })
        .onConflictDoUpdate({
          target: [schema.blockRun.episodeId, schema.blockRun.nodeId],
          set: { status: "running", itemsTotal: items.length, itemsDone: 0, error: null, startedAt: new Date(), finishedAt: null },
        });
      return items;
    },

    async runBlockItem(episodeId: string, nodeId: string, executor: Executor, item: number) {
      await executors[executor](episodeId, item, nodeId);
      await db
        .update(schema.blockRun)
        .set({ itemsDone: sql`${schema.blockRun.itemsDone} + 1` })
        .where(and(eq(schema.blockRun.episodeId, episodeId), eq(schema.blockRun.nodeId, nodeId)));
    },

    async endBlock(episodeId: string, nodeId: string, status: "completed" | "failed", error?: string) {
      await db
        .update(schema.blockRun)
        .set({ status, error: error ?? null, finishedAt: new Date() })
        .where(and(eq(schema.blockRun.episodeId, episodeId), eq(schema.blockRun.nodeId, nodeId)));
    },

    /* ─────────────── TaleStudio Characters ─────────────── */

    /** Reserve a character generation's tokens (idempotent per job). */
    async reserveCharacterJob(jobId: string) {
      const job = await db.query.characterJob.findFirst({ where: eq(schema.characterJob.id, jobId) });
      if (!job) throw new NonRetryableError(`character job ${jobId} not found`);
      await applyCredits({ organizationId: job.organizationId, actorId: job.createdBy, delta: -job.tokens, reason: "character_generation", idempotencyKey: `character:${jobId}` });
      await db.update(schema.characterJob).set({ status: "running" }).where(eq(schema.characterJob.id, jobId));
    },

    /**
     * Generate a job's images: 4 face proposals, the identity pack (6 angles + 4 expressions from the master), or one
     * extra outfit/expression. Pack and extras are checked against the master and auto-approved only if they match.
     * Each image has a deterministic storage key, so a retried activity skips what it already produced.
     */
    async generateCharacterJob(jobId: string) {
      const job = await db.query.characterJob.findFirst({ where: eq(schema.characterJob.id, jobId), with: { character: { with: { references: true } } } });
      if (!job) throw new NonRetryableError(`character job ${jobId} not found`);
      const c = job.character;
      const master = c.masterKey;
      if (job.kind !== "candidates" && !master) throw new NonRetryableError("Choose a master portrait first");
      const angles = c.references.filter((r) => r.approved && r.kind === "angle").slice(0, MAX_REFS_PER_CHARACTER - 1);

      const items: { kind: "candidate" | "angle" | "expression" | "outfit"; label: string; prompt: string; refs: string[] }[] =
        job.kind === "candidates"
          ? [0, 1, 2, 3].map((i) => ({ kind: "candidate", label: `proposal ${i + 1}`, prompt: `${characterPrompt({ id: c.slug, name: c.name, appearance: c.appearance, voice: c.voiceStyle, bio: c.backstory }, c.style)} Proposal ${i + 1} of 4: give this one its own distinct face.`, refs: [] }))
          : job.kind === "pack"
            ? [
                ...IDENTITY_PACK.angles.map((a) => ({ kind: "angle" as const, label: a, prompt: referencePrompt(c, c.style, a, true), refs: [master!] })),
                ...IDENTITY_PACK.expressions.map((e) => ({ kind: "expression" as const, label: e, prompt: referencePrompt(c, c.style, `Close-up portrait, ${e}`, true), refs: [master!] })),
              ]
            : [{ kind: job.input.kind ?? "outfit", label: job.input.description ?? "", prompt: referencePrompt(c, c.style, job.input.kind === "expression" ? `Close-up portrait, ${job.input.description}` : `Full body, wearing ${job.input.description}`, true), refs: [master!, ...angles.map((r) => r.storageKey)] }];

      let cost = 0;
      try {
        for (const [i, item] of items.entries()) {
          const prefix = keys.character(job.organizationId, c.id, `${jobId}/${i}.`);
          if (c.references.some((r) => r.storageKey.startsWith(prefix))) continue;
          const out = await providers.image.variant({ prompt: item.prompt, refs: await Promise.all(item.refs.map((k) => fetchUrl(k))), aspect: "portrait" });
          cost += out.costUsd;
          const key = `${prefix}${EXT[out.contentType] ?? "bin"}`;
          if (out.bytes) await putObject({ key, body: out.bytes, contentType: out.contentType });
          else if (out.url) await putFromUrl(out.url, { key, contentType: out.contentType });
          let check: { same: boolean; score: number; issues: string } | null = null;
          if (item.kind !== "candidate" && master) {
            const verdict = await providers.identity.check({ referenceUrl: await fetchUrl(master), candidateUrl: await fetchUrl(key), name: c.name });
            cost += verdict.costUsd;
            check = { same: verdict.same, score: verdict.score, issues: verdict.issues };
          }
          await db.insert(schema.characterReference).values({ characterId: c.id, kind: item.kind, label: item.label, storageKey: key, contentType: out.contentType, approved: check?.same ?? false, check });
        }
      } finally {
        // Recorded even on failure: a failed job keeps (at cost price) what was really spent.
        if (cost) await db.update(schema.characterJob).set({ costUsd: sql`${schema.characterJob.costUsd} + ${cost}` }).where(eq(schema.characterJob.id, jobId));
      }
    },

    /** Close a job; on failure refund its tokens minus the provider cost of the images already generated (kept). */
    async finishCharacterJob(jobId: string, error: string | null) {
      const job = await db.query.characterJob.findFirst({ where: eq(schema.characterJob.id, jobId) });
      if (!job) return;
      if (error) {
        const reserved = await db.query.creditLedger.findFirst({ where: eq(schema.creditLedger.idempotencyKey, `character:${jobId}`) });
        const refund = reserved ? -reserved.delta - Math.min(-reserved.delta, tokensForCost(job.costUsd)) : 0;
        if (refund > 0) await applyCredits({ organizationId: job.organizationId, delta: refund, reason: "episode_refund", idempotencyKey: `refund:character:${jobId}` });
      }
      await db.update(schema.characterJob).set({ status: error ? "failed" : "completed", error }).where(eq(schema.characterJob.id, jobId));
    },

    /* ─────────────── Storyboard editing ─────────────── */

    /** Charge one redraw and drop the old frame so drawKeyframe regenerates it. */
    async prepareRedraw(episodeId: string, shotIndex: number, requestId: string) {
      const ep = await loadEpisode(episodeId);
      const key = `redraw:${episodeId}:${shotIndex}:${requestId}`;
      await applyCredits({ organizationId: ep.organizationId, delta: -TOKEN_COSTS.keyframeRedraw, reason: "keyframe_redraw", episodeId, idempotencyKey: key });
      await db.delete(schema.asset).where(and(eq(schema.asset.episodeId, episodeId), eq(schema.asset.kind, "keyframe"), eq(schema.asset.ref, String(shotIndex))));
      return key;
    },

    drawKeyframe: (episodeId: string, shotIndex: number) => executors.drawKeyframe(episodeId, shotIndex, "keyframes"),
  };
}

export type Activities = ReturnType<typeof createActivities>;
