import { writeFileSync } from "node:fs";
import { PgBoss } from "pg-boss";

// Worker process: same image as web, separate container. No jobs yet.
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
boss.on("error", (err) => console.error("pg-boss", err));
await boss.start();
console.log("worker: pg-boss started");

// Heartbeat for the container healthcheck (the image has no shell or curl).
const beat = () => writeFileSync("/tmp/worker-alive", "");
beat();
const timer = setInterval(beat, 15_000);

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    clearInterval(timer);
    await boss.stop({ graceful: true });
    process.exit(0);
  });
}
