import { json, respond } from "@/lib/api";
import { createCharacter, listCharacters } from "@/lib/characters";
import { apiWorkspace } from "@/lib/workspace";

export async function GET() {
  const { ws, error } = await apiWorkspace("project:read");
  if (error) return error;
  return json({ characters: await listCharacters(ws.org.id) });
}

/** Create a character sheet (free). */
export async function POST(req: Request) {
  const { ws, error } = await apiWorkspace("character:edit");
  if (error) return error;
  return respond(await createCharacter(ws, await req.json().catch(() => null)), 201);
}
