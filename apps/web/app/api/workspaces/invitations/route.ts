import { respond } from "@/lib/api";
import { invite } from "@/lib/team";
import { apiWorkspace } from "@/lib/workspace";

export async function POST(req: Request) {
  const { ws, error } = await apiWorkspace("members:manage");
  if (error) return error;
  return respond(await invite(ws, await req.json().catch(() => null)), 201);
}
