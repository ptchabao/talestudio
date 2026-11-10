import { json, problem } from "@/lib/api";
import { apiWorkspace } from "@/lib/workspace";
import { keys, presignUpload } from "@talestudio/storage";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const MAX_BYTES = 4 * 1024 ** 3; // 4 GB: two hours of 1080p podcast video
const EXT: Record<string, string> = {
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav", "audio/aac": "aac", "audio/ogg": "ogg",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};

/** Presigned direct upload for a recording (Podcast to Clips). The browser PUTs the file straight to storage. */
export async function POST(req: Request) {
  const { ws, error } = await apiWorkspace("production:create");
  if (error) return error;
  const parsed = z.object({ contentType: z.string(), size: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, "invalid_input", "Invalid request", { fields: "file" });
  const ext = EXT[parsed.data.contentType];
  if (!ext) return problem(415, "unsupported_file", "Audio or video files only");
  if (parsed.data.size > MAX_BYTES) return problem(413, "file_too_large", "File too large", { max: "4 GB" });
  const key = keys.upload(ws.org.id, randomUUID(), ext);
  return json({ key, url: await presignUpload(key, parsed.data.contentType) });
}
