import "server-only";
import { characterExtraInput, characterInput, characterNoteInput, TOKEN_COSTS, type CharacterJobKind } from "@talestudio/core";
import { and, asc, db, desc, eq, inArray, schema } from "@talestudio/db";
import { urlFor } from "@talestudio/storage";
import { z } from "zod";
import { startCharacterJob } from "./pipeline";
import { fail, invalidInput, type Failure } from "./validation";
import type { WorkspaceContext } from "./workspace";

/**
 * TaleStudio Characters: persistent characters owned by the workspace.
 * Free: create, edit, approve references, lock, duplicate, export, write memory. Paid (TT): generations only.
 */

const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "character";

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

async function own(orgId: string, id: string) {
  if (!isUuid(id)) return null;
  return db.query.character.findFirst({ where: and(eq(schema.character.id, id), eq(schema.character.organizationId, orgId)) });
}

/** Insert with the first free slug of the workspace (name-based, then suffixed). */
async function insertWithSlug(values: Omit<typeof schema.character.$inferInsert, "slug">) {
  const base = slugify(values.name);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [row] = await db.insert(schema.character).values({ ...values, slug }).onConflictDoNothing().returning({ id: schema.character.id });
    if (row) return row.id;
  }
  throw new Error("No free slug");
}

/** Projects keep a copy of each cast member: keep it in step with the library identity. */
async function syncCasts(characterId: string) {
  const c = await db.query.character.findFirst({ where: eq(schema.character.id, characterId) });
  if (!c) return;
  await db
    .update(schema.castMember)
    .set({ name: c.name, appearance: c.appearance, voice: c.voiceStyle || undefined, ...(c.masterKey ? { imageKey: c.masterKey } : {}) })
    .where(eq(schema.castMember.characterId, characterId));
}

export async function listCharacters(orgId: string) {
  const rows = await db.query.character.findMany({
    where: eq(schema.character.organizationId, orgId),
    orderBy: desc(schema.character.updatedAt),
    with: { references: { columns: { approved: true } } },
  });
  return Promise.all(
    rows.map(async (c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      status: c.status,
      version: c.version,
      masterUrl: c.masterKey ? await urlFor(c.masterKey) : null,
      approved: c.references.filter((r) => r.approved).length,
    })),
  );
}
export type CharacterCard = Awaited<ReturnType<typeof listCharacters>>[number];

export async function createCharacter(ws: WorkspaceContext, raw: unknown): Promise<{ ok: true; id: string } | Failure> {
  const parsed = characterInput.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  const id = await insertWithSlug({ ...parsed.data, organizationId: ws.org.id, createdBy: ws.user.id });
  return { ok: true, id };
}

/** Locked: the identity is frozen; only the backstory (story memory) can still evolve. */
export async function updateCharacter(ws: WorkspaceContext, id: string, raw: unknown): Promise<{ ok: true } | Failure> {
  const c = await own(ws.org.id, id);
  if (!c) return fail(404, "not_found", "Character not found");
  const parsed = characterInput.partial().safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  const changes = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  if (c.status === "locked" && Object.keys(changes).some((k) => k !== "backstory")) return fail(409, "character_locked", "Unlock the character to change its identity");
  await db.update(schema.character).set({ ...changes, updatedAt: new Date() }).where(eq(schema.character.id, id));
  await syncCasts(id);
  return { ok: true };
}

export async function deleteCharacter(ws: WorkspaceContext, id: string): Promise<{ ok: true } | Failure> {
  const c = await own(ws.org.id, id);
  if (!c) return fail(404, "not_found", "Character not found");
  await db.delete(schema.character).where(eq(schema.character.id, id));
  return { ok: true };
}

const JOB_TOKENS: Record<CharacterJobKind, number> = { candidates: TOKEN_COSTS.characterCandidates, pack: TOKEN_COSTS.identityPack, extra: TOKEN_COSTS.characterExtra };

/** Start a paid generation. One at a time per character; the price is reserved by the job itself. */
export async function generateForCharacter(ws: WorkspaceContext, id: string, raw: unknown): Promise<{ ok: true } | Failure> {
  const c = await own(ws.org.id, id);
  if (!c) return fail(404, "not_found", "Character not found");
  const parsed = z.object({ kind: z.enum(["candidates", "pack", "extra"]), extra: characterExtraInput.optional() }).safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  const { kind, extra } = parsed.data;
  if (kind === "candidates" && c.status === "locked") return fail(409, "character_locked", "A locked identity keeps its face");
  if (kind !== "candidates" && !c.masterKey) return fail(409, "no_master", "Choose a master portrait first");
  if (kind === "extra" && !extra) return fail(400, "invalid_input", "Describe the outfit or expression", { fields: "description" });
  const busy = await db.query.characterJob.findFirst({ where: and(eq(schema.characterJob.characterId, id), inArray(schema.characterJob.status, ["queued", "running"])) });
  if (busy) return fail(409, "job_running", "A generation is already running for this character");
  const tokens = JOB_TOKENS[kind];
  if (ws.org.credits < tokens) return fail(402, "insufficient_credits", "Not enough tokens", { needed: tokens, have: ws.org.credits });
  const [job] = await db
    .insert(schema.characterJob)
    .values({ characterId: id, organizationId: ws.org.id, kind, input: extra ?? {}, tokens, createdBy: ws.user.id })
    .returning({ id: schema.characterJob.id });
  await startCharacterJob(job!.id);
  return { ok: true };
}

/** Approve/reject a reference, or make it the master portrait (not while the identity is locked). */
export async function updateReference(ws: WorkspaceContext, id: string, refId: string, raw: unknown): Promise<{ ok: true } | Failure> {
  const c = await own(ws.org.id, id);
  if (!c || !isUuid(refId)) return fail(404, "not_found", "Character not found");
  const ref = await db.query.characterReference.findFirst({ where: and(eq(schema.characterReference.id, refId), eq(schema.characterReference.characterId, id)) });
  if (!ref) return fail(404, "not_found", "Reference not found");
  const parsed = z.object({ approved: z.boolean().optional(), master: z.literal(true).optional() }).safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  if (parsed.data.master) {
    if (c.status === "locked") return fail(409, "character_locked", "Unlock the character to change its face");
    await db.transaction(async (tx) => {
      await tx
        .update(schema.characterReference)
        .set({ kind: "candidate", approved: false })
        .where(and(eq(schema.characterReference.characterId, id), eq(schema.characterReference.kind, "master")));
      await tx.update(schema.characterReference).set({ kind: "master", approved: true, check: null }).where(eq(schema.characterReference.id, refId));
      await tx.update(schema.character).set({ masterKey: ref.storageKey, updatedAt: new Date() }).where(eq(schema.character.id, id));
    });
    await syncCasts(id);
  } else if (parsed.data.approved !== undefined) {
    if (ref.kind === "master") return fail(409, "not_editable", "The master portrait is always approved");
    await db.update(schema.characterReference).set({ approved: parsed.data.approved }).where(eq(schema.characterReference.id, refId));
  }
  return { ok: true };
}

export async function deleteReference(ws: WorkspaceContext, id: string, refId: string): Promise<{ ok: true } | Failure> {
  const c = await own(ws.org.id, id);
  if (!c || !isUuid(refId)) return fail(404, "not_found", "Character not found");
  const ref = await db.query.characterReference.findFirst({ where: and(eq(schema.characterReference.id, refId), eq(schema.characterReference.characterId, id)) });
  if (!ref) return fail(404, "not_found", "Reference not found");
  if (ref.kind === "master") return fail(409, "not_editable", "The master portrait cannot be deleted");
  await db.delete(schema.characterReference).where(eq(schema.characterReference.id, refId));
  return { ok: true };
}

/** Lock the identity: a new version, with a snapshot to compare against later ones. */
export async function lockCharacter(ws: WorkspaceContext, id: string): Promise<{ ok: true } | Failure> {
  const c = await own(ws.org.id, id);
  if (!c) return fail(404, "not_found", "Character not found");
  if (!c.masterKey) return fail(409, "no_master", "Choose a master portrait first");
  if (c.status === "locked") return { ok: true };
  const refs = await db.query.characterReference.findMany({ where: and(eq(schema.characterReference.characterId, id), eq(schema.characterReference.approved, true)), columns: { id: true } });
  const version = c.version + 1;
  await db.transaction(async (tx) => {
    await tx.insert(schema.characterVersion).values({
      characterId: id,
      version,
      snapshot: { name: c.name, appearance: c.appearance, personality: c.personality, backstory: c.backstory, voiceKind: c.voiceKind, voiceStyle: c.voiceStyle, masterKey: c.masterKey, references: refs.length },
    });
    await tx.update(schema.character).set({ status: "locked", version, updatedAt: new Date() }).where(eq(schema.character.id, id));
  });
  return { ok: true };
}

export async function unlockCharacter(ws: WorkspaceContext, id: string): Promise<{ ok: true } | Failure> {
  const c = await own(ws.org.id, id);
  if (!c) return fail(404, "not_found", "Character not found");
  await db.update(schema.character).set({ status: "draft", updatedAt: new Date() }).where(eq(schema.character.id, id));
  return { ok: true };
}

/** Copy as a new draft (references point to the same stored images: nothing is regenerated or charged). */
export async function duplicateCharacter(ws: WorkspaceContext, id: string, copyLabel: string): Promise<{ ok: true; id: string } | Failure> {
  const c = await own(ws.org.id, id);
  if (!c) return fail(404, "not_found", "Character not found");
  const newId = await insertWithSlug({
    organizationId: ws.org.id,
    name: `${c.name} ${copyLabel}`.slice(0, 60),
    kind: c.kind,
    style: c.style,
    appearance: c.appearance,
    personality: c.personality,
    backstory: c.backstory,
    voiceKind: c.voiceKind,
    voiceStyle: c.voiceStyle,
    masterKey: c.masterKey,
    createdBy: ws.user.id,
  });
  const refs = await db.query.characterReference.findMany({ where: eq(schema.characterReference.characterId, id) });
  if (refs.length) await db.insert(schema.characterReference).values(refs.map(({ id: _id, characterId: _c, createdAt: _a, updatedAt: _u, ...r }) => ({ ...r, characterId: newId })));
  return { ok: true, id: newId };
}

export async function addNote(ws: WorkspaceContext, id: string, raw: unknown): Promise<{ ok: true } | Failure> {
  const c = await own(ws.org.id, id);
  if (!c) return fail(404, "not_found", "Character not found");
  const parsed = characterNoteInput.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  await db.insert(schema.characterEvent).values({ characterId: id, text: parsed.data.text });
  return { ok: true };
}

/** Productions featuring the character: through a project cast linked to it, or explicitly requested. */
async function productionsOf(orgId: string, id: string) {
  const casts = await db.query.castMember.findMany({ where: eq(schema.castMember.characterId, id), columns: { projectId: true, slug: true } });
  const slugByProject = new Map(casts.map((c) => [c.projectId, c.slug]));
  const episodes = await db.query.episode.findMany({
    where: eq(schema.episode.organizationId, orgId),
    orderBy: desc(schema.episode.createdAt),
    columns: { id: true, projectId: true, number: true, title: true, status: true, script: true, characterIds: true, createdAt: true },
    with: { project: { columns: { title: true } } },
  });
  return episodes
    .filter((e) => e.characterIds.includes(id) || (slugByProject.has(e.projectId) && e.script?.characters.some((c) => c.id === slugByProject.get(e.projectId))))
    .map((e) => ({ id: e.id, projectId: e.projectId, project: e.project.title, number: e.number, title: e.title, status: e.status }));
}

export async function getCharacterView(orgId: string, id: string) {
  const c = await own(orgId, id);
  if (!c) return null;
  const [references, jobs, events, versions, productions] = await Promise.all([
    db.query.characterReference.findMany({ where: eq(schema.characterReference.characterId, id), orderBy: asc(schema.characterReference.createdAt) }),
    db.query.characterJob.findMany({ where: eq(schema.characterJob.characterId, id), orderBy: desc(schema.characterJob.createdAt), limit: 10 }),
    db.query.characterEvent.findMany({ where: eq(schema.characterEvent.characterId, id), orderBy: desc(schema.characterEvent.createdAt), limit: 50 }),
    db.query.characterVersion.findMany({ where: eq(schema.characterVersion.characterId, id), orderBy: desc(schema.characterVersion.version) }),
    productionsOf(orgId, id),
  ]);
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    kind: c.kind,
    status: c.status,
    style: c.style,
    appearance: c.appearance,
    personality: c.personality,
    backstory: c.backstory,
    voiceKind: c.voiceKind,
    voiceStyle: c.voiceStyle,
    version: c.version,
    masterUrl: c.masterKey ? await urlFor(c.masterKey) : null,
    references: await Promise.all(references.map(async (r) => ({ id: r.id, kind: r.kind, label: r.label, approved: r.approved, check: r.check, url: await urlFor(r.storageKey) }))),
    jobs: jobs.map((j) => ({ id: j.id, kind: j.kind, status: j.status, tokens: j.tokens, error: j.error, createdAt: j.createdAt.toISOString() })),
    busy: jobs.some((j) => j.status === "queued" || j.status === "running"),
    events: events.map((e) => ({ id: e.id, text: e.text, auto: Boolean(e.episodeId), createdAt: e.createdAt.toISOString() })),
    versions: await Promise.all(versions.map(async (v) => ({ version: v.version, createdAt: v.createdAt.toISOString(), snapshot: v.snapshot, masterUrl: v.snapshot.masterKey ? await urlFor(v.snapshot.masterKey) : null }))),
    productions,
  };
}
export type CharacterView = NonNullable<Awaited<ReturnType<typeof getCharacterView>>>;

/** Portable JSON of a character: identity, memory, versions and links to its references. */
export async function exportCharacter(orgId: string, id: string) {
  const v = await getCharacterView(orgId, id);
  if (!v) return null;
  const { busy: _b, jobs: _j, masterUrl, ...rest } = v;
  return { format: "talestudio.character@1", exportedAt: new Date().toISOString(), ...rest, masterUrl, references: v.references.filter((r) => r.approved) };
}

/** Link library characters to a project's cast so a production can feature them (no portrait regenerated). */
export async function castIntoProject(orgId: string, projectId: string, characterIds: string[]) {
  if (!characterIds.length) return [];
  const chars = await db.query.character.findMany({ where: and(eq(schema.character.organizationId, orgId), inArray(schema.character.id, characterIds)) });
  const cast = await db.query.castMember.findMany({ where: eq(schema.castMember.projectId, projectId) });
  for (const c of chars) {
    if (cast.some((m) => m.characterId === c.id)) continue;
    const slug = cast.some((m) => m.slug === c.slug) ? `${c.slug}-${c.id.slice(0, 4)}` : c.slug;
    await db
      .insert(schema.castMember)
      .values({ projectId, slug, name: c.name, appearance: c.appearance, voice: c.voiceStyle || c.voiceKind, bio: c.backstory.slice(0, 300) || null, imageKey: c.masterKey, characterId: c.id })
      .onConflictDoNothing();
  }
  return chars.map((c) => c.id);
}
