import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Deploy guards that actionlint cannot see. Runs under `bun --bun`, so Bun.YAML is there.
const load = (name: string) => {
  const text = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
  return { text, yaml: Bun.YAML.parse(text) as any };
};
const ci = load("ci.yml");
const deploy = load("deploy.yml");

describe("deploy workflow", () => {
  it("builds the image only after the test workflow passes", () => {
    expect(ci.yaml.on).toHaveProperty("workflow_call");
    expect(deploy.yaml.jobs.test.uses).toBe("./.github/workflows/ci.yml");
    expect(deploy.yaml.jobs.test.permissions).toEqual({ contents: "read" });
    expect([deploy.yaml.jobs.image.needs].flat()).toContain("test");
  });

  it("deploys only main, manual runs included", () => {
    expect(deploy.yaml.jobs.image.if).toContain("github.ref == 'refs/heads/main'");
  });

  it("names the image from github.repository, never a fixed owner", () => {
    expect(deploy.text).not.toMatch(/ghcr\.io\/[a-z0-9-]+\//i);
  });
});
