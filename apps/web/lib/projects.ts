import "server-only";
import { createProjectInput } from "@talestudio/core";
import { and, asc, db, desc, eq, schema, sql } from "@talestudio/db";
import { urlFor } from "@talestudio/storage";
import { invalidInput, type Failure } from "./validation";
import type { WorkspaceContext } from "./workspace";

export async function createProject(ws: WorkspaceContext, raw: unknown): Promise<{ ok: true; id: string } | Failure> {
  const parsed = createProjectInput.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error.issues);
  const { brief, ...rest } = parsed.data;
  const [row] = await db
    .insert(schema.project)
    .values({ ...rest, brief, organizationId: ws.org.id, createdBy: ws.user.id })
    .returning({ id: schema.project.id });
  return { ok: true, id: row!.id };
}

const coverOf = async (e: { thumbnailKey: string | null; assets: { storageKey: string }[] }) => {
  const key = e.thumbnailKey ?? e.assets[0]?.storageKey;
  return key ? urlFor(key) : null;
};

/** Project cards: cover = thumbnail or first frame of the latest production that has one. */
export async function listProjects(orgId: string) {
  const rows = await db.query.project.findMany({
    where: eq(schema.project.organizationId, orgId),
    orderBy: desc(schema.project.updatedAt),
    with: { episodes: { orderBy: desc(schema.episode.number), columns: { id: true, status: true, thumbnailKey: true }, with: { assets: { where: (a, { and, eq }) => and(eq(a.kind, "keyframe"), eq(a.ref, "0")), limit: 1, columns: { storageKey: true } } } } },
  });
  return Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      studio: p.studio,
      title: p.title,
      description: p.description,
      style: p.style,
      count: p.episodes.length,
      latestStatus: p.episodes[0]?.status ?? null,
      cover: await (async () => {
        const e = p.episodes.find((x) => x.thumbnailKey || x.assets[0]);
        return e ? coverOf(e) : null;
      })(),
    })),
  );
}

export async function getProjectView(orgId: string, id: string) {
  const p = await db.query.project.findFirst({
    where: and(eq(schema.project.id, id), eq(schema.project.organizationId, orgId)),
    with: {
      cast: { orderBy: [asc(schema.castMember.createdAt), asc(schema.castMember.slug)] },
      episodes: { orderBy: asc(schema.episode.number), with: { assets: { where: (a, { and, eq }) => and(eq(a.kind, "keyframe"), eq(a.ref, "0")), limit: 1, columns: { storageKey: true } } } },
    },
  });
  if (!p) return null;
  return {
    ...p,
    cast: await Promise.all(p.cast.map(async (c) => ({ ...c, imageUrl: c.imageKey ? await urlFor(c.imageKey) : null }))),
    episodes: await Promise.all(
      p.episodes.map(async (e) => ({ id: e.id, number: e.number, title: e.title, premise: e.premise, status: e.status, progress: e.progress, durationSec: e.durationSec, cover: await coverOf(e) })),
    ),
  };
}
export type ProjectView = NonNullable<Awaited<ReturnType<typeof getProjectView>>>;

/** Lock the project row so concurrent creations can't grab the same number. */
export async function nextNumber(tx: Pick<typeof db, "execute">, projectId: string): Promise<number> {
  await tx.execute(sql`select 1 from ${schema.project} where ${schema.project.id} = ${projectId} for update`);
  const res = await tx.execute<{ n: number }>(sql`select coalesce(max(${schema.episode.number}), 0)::int + 1 as n from ${schema.episode} where ${schema.episode.projectId} = ${projectId}`);
  return Number(res[0]?.n ?? 1);
}
