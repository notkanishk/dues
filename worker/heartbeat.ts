import { writeFileSync } from "node:fs";
import type { PgBoss } from "pg-boss";

// Heartbeat for the container healthcheck (the image has no shell or curl).
// Touch the file only after pg-boss answers, so "healthy" means the queue database works.
export async function beat(boss: Pick<PgBoss, "getQueues">, path = "/tmp/worker-alive") {
  try {
    await boss.getQueues();
    writeFileSync(path, "");
    return true;
  } catch (err) {
    console.error("worker: heartbeat skipped", err);
    return false;
  }
}
