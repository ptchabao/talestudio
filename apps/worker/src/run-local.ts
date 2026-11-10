/**
 * Run one stage of a production without Temporal:
 *   pnpm --filter @talestudio/worker run-local <episodeId> [storyboard|production]
 */
import { db, eq, schema } from "@talestudio/db";
import { createActivities, runStage } from "@talestudio/pipeline";

const [id, stage = "storyboard"] = process.argv.slice(2);
if (!id || (stage !== "storyboard" && stage !== "production")) {
  console.error("usage: run-local <episodeId> [storyboard|production]");
  process.exit(1);
}
const ep = await db.query.episode.findFirst({ where: eq(schema.episode.id, id) });
if (!ep) throw new Error(`episode ${id} not found`);
console.log(`episode ${id} → ${await runStage(id, ep.workflow, stage, createActivities())}`);
process.exit(0);
