import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    pool: "threads", // Bun: the forks pool fails (ADR 0007)
    globalSetup: ["./test/migrate-once.ts"],
    // ponytail: files run one at a time: DB tests share one database and its global Reference sequences
    // (one test moves a sequence and restores it). Per-file databases if the suite ever gets slow.
    fileParallelism: false,
  },
});
