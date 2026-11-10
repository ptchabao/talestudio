import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Key layout
 *   raw/<episodeId>/<kind>/<ref>.<ext>   intermediates — expired by S3 lifecycle via the `retention` tag
 *   final/<orgId>/<episodeId>/<file>        deliverables — kept, served through the CDN
 *   final/<orgId>/projects/<projectId>/…    recurring cast portraits — kept, reused across productions
 *   private/<orgId>/uploads/<id>.<ext>      user uploads (recordings) — kept, never exposed through the CDN
 *
 * Lifecycle rules live in infra/terraform/storage.tf (tag retention=7 → 7 days, retention=14 → 14 days).
 */
export const BUCKET = process.env.S3_BUCKET ?? "talestudio";

const globalForS3 = globalThis as unknown as { __tsS3?: S3Client };
export const s3 =
  globalForS3.__tsS3 ??
  new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT), // LocalStack in dev
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
globalForS3.__tsS3 = s3;

export const keys = {
  raw: (episodeId: string, kind: string, ref: string, ext: string) => `raw/${episodeId}/${kind}/${ref}.${ext}`,
  final: (orgId: string, episodeId: string, file: string) => `final/${orgId}/${episodeId}/${file}`,
  /** Project-level assets (cast portraits) — kept, reused by every production. */
  project: (orgId: string, projectId: string, file: string) => `final/${orgId}/projects/${projectId}/${file}`,
  upload: (orgId: string, id: string, ext: string) => `private/${orgId}/uploads/${id}.${ext}`,
  /** TaleStudio Characters references — kept, reused by every production of the workspace. */
  character: (orgId: string, characterId: string, file: string) => `final/${orgId}/characters/${characterId}/${file}`,
};

export const isRawKey = (key: string) => key.startsWith("raw/");

export interface PutOptions {
  key: string;
  body: Uint8Array | Buffer | string;
  contentType: string;
  /** Required for raw/ keys — drives the lifecycle expiration rule. */
  retentionDays?: 7 | 14;
}

export async function putObject({ key, body, contentType, retentionDays }: PutOptions): Promise<string> {
  if (isRawKey(key) && !retentionDays) throw new Error(`raw key ${key} needs retentionDays`);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      Tagging: retentionDays ? `retention=${retentionDays}` : undefined,
      CacheControl: isRawKey(key) ? "private, max-age=3600" : "public, max-age=31536000, immutable",
    }),
  );
  return key;
}

/** Download a remote provider URL (fal, ElevenLabs…) and persist it — provider URLs are short-lived. */
export async function putFromUrl(url: string, opts: Omit<PutOptions, "body" | "contentType"> & { contentType?: string }) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  const body = new Uint8Array(await res.arrayBuffer());
  return putObject({ ...opts, body, contentType: opts.contentType ?? res.headers.get("content-type") ?? "application/octet-stream" });
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const out = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!out.Body) throw new Error(`empty object ${key}`);
  return out.Body.transformToByteArray();
}

/** Public URL for finals when a CDN is configured, otherwise a short-lived signed URL. */
export async function urlFor(key: string, expiresIn = 3600): Promise<string> {
  const cdn = process.env.CDN_BASE_URL;
  if (cdn && key.startsWith("final/")) return `${cdn.replace(/\/$/, "")}/${key}`;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

/** Browser → S3 direct upload: a short-lived signed PUT, so large recordings never transit the web tier. */
export async function presignUpload(key: string, contentType: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn });
}

export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}
