import { json, respond } from "@/lib/api";
import { createProject, listProjects } from "@/lib/projects";
import { apiWorkspace } from "@/lib/workspace";

export async function GET() {
  const { ws, error } = await apiWorkspace("project:read");
  if (error) return error;
  return json({ projects: await listProjects(ws.org.id) });
}

export async function POST(req: Request) {
  const { ws, error } = await apiWorkspace("project:create");
  if (error) return error;
  return respond(await createProject(ws, await req.json().catch(() => null)), 201);
}
