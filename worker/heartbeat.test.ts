import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { beat } from "./heartbeat";

// The container healthcheck reads the heartbeat file, so it must only be touched when pg-boss answers.
const file = () => join(mkdtempSync(join(tmpdir(), "dues-beat-")), "alive");

describe("worker heartbeat", () => {
  it("touches the file when pg-boss answers", async () => {
    const path = file();
    expect(await beat({ getQueues: async () => [] }, path)).toBe(true);
    expect(existsSync(path)).toBe(true);
  });

  it("leaves the file alone when pg-boss fails", async () => {
    const path = file();
    const boss = { getQueues: async () => Promise.reject(new Error("connection refused")) };
    expect(await beat(boss, path)).toBe(false);
    expect(existsSync(path)).toBe(false);
  });
});
