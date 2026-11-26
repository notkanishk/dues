import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { pool: "threads", globalSetup: ["./test/migrate-once.ts"] }, // Bun: the forks pool fails (ADR 0007)
});
