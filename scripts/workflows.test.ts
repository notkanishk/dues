import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Deploy guards that actionlint cannot see. Runs under `bun --bun`, so Bun.YAML is there.
const load = (name: string) => {
  const text = readFileSync(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
  return { text, yaml: Bun.YAML.parse(text) as any };
};
const ci = load("ci.yml");
const deploy = load("deploy.yml");
const jobs = deploy.yaml.jobs as Record<string, any>;
const needs = (job: string) => [jobs[job].needs].flat();
const selfHosted = Object.entries(jobs).filter(([, j]) => [j["runs-on"]].flat().includes("self-hosted"));

describe("deploy workflow", () => {
  it("is never triggered by a pull request", () => {
    expect(deploy.yaml.on).not.toHaveProperty("pull_request");
    expect(deploy.yaml.on).not.toHaveProperty("pull_request_target");
  });

  it("deploys dev only after the test workflow passes, and prod only after dev", () => {
    expect(ci.yaml.on).toHaveProperty("workflow_call");
    expect(jobs.test.uses).toBe("./.github/workflows/ci.yml");
    expect(jobs.test.permissions).toEqual({ contents: "read" });
    expect(needs("dev")).toContain("test");
    expect(needs("prod")).toContain("dev");
  });

  it("deploys only main of the main repository, manual runs included", () => {
    for (const job of ["dev", "prod"]) {
      expect(jobs[job].if).toContain("github.ref == 'refs/heads/main'");
      expect(jobs[job].if).toContain("github.repository == 'notkanishk/dues'");
    }
  });

  it("passes only the commit id to dues-deploy, through env", () => {
    for (const job of ["dev", "prod"]) {
      expect(jobs[job].steps).toHaveLength(1);
      const [step] = jobs[job].steps;
      expect(step.run).toBe('sudo -n /usr/local/sbin/dues-deploy "$DEPLOY_SHA"');
      expect(step.env).toEqual({ DEPLOY_SHA: "${{ github.sha }}" });
    }
  });

  it("runs no actions on a self-hosted runner", () => {
    expect(selfHosted.map(([name]) => name).sort()).toEqual(["dev", "prod"]);
    for (const [, job] of selfHosted) {
      expect(job.uses).toBeUndefined();
      for (const step of job.steps) expect(step.uses).toBeUndefined();
    }
  });

  it("uses no registry and asks for no package permission", () => {
    expect(deploy.text).not.toMatch(/ghcr\.io/i);
    expect(deploy.text).not.toMatch(/packages:/);
  });
});
