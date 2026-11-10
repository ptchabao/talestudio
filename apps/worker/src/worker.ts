import { createActivities, TASK_QUEUE } from "@talestudio/pipeline";
import { NativeConnection, Worker } from "@temporalio/worker";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function main() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    tls: process.env.TEMPORAL_API_KEY ? true : undefined,
    apiKey: process.env.TEMPORAL_API_KEY || undefined,
  });
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve("./workflows.ts"),
    activities: createActivities(),
    // Activities are I/O bound (waiting on GPU providers): run many per worker, scale workers horizontally.
    maxConcurrentActivityTaskExecutions: Number(process.env.WORKER_ACTIVITY_CONCURRENCY ?? 50),
    shutdownGraceTime: "5 minutes",
  });
  console.log(`[worker] polling task queue "${TASK_QUEUE}"`);
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
