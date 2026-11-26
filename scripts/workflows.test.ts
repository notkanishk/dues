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

// Branch deploys: `gh workflow run deploy-dev.yml --ref <branch>` puts any branch on dev, never prod.
const dev = load("deploy-dev.yml");
const devJobs = dev.yaml.jobs as Record<string, any>;

describe("deploy-dev workflow", () => {
  it("runs only when started by hand", () => {
    expect(Object.keys(dev.yaml.on)).toEqual(["workflow_dispatch"]);
    expect(dev.yaml.on.workflow_dispatch).toBeNull();
  });

  it("never runs on the prod runner", () => {
    for (const job of Object.values(devJobs)) expect([job["runs-on"]].flat()).not.toContain("dues-prod");
    expect(dev.text).not.toMatch(/dues-prod/);
  });

  it("deploys to dev only after the test workflow passes", () => {
    expect(devJobs.test.uses).toBe("./.github/workflows/ci.yml");
    expect(devJobs.test.permissions).toEqual({ contents: "read" });
    expect([devJobs.dev.needs].flat()).toEqual(["test"]);
    expect([devJobs.dev["runs-on"]].flat()).toEqual(["self-hosted", "dues-dev"]);
    expect(devJobs.dev.if).toBe("github.repository == 'notkanishk/dues'");
  });

  it("runs no actions on the self-hosted runner and passes only the commit id, through env", () => {
    expect(devJobs.dev.uses).toBeUndefined();
    expect(devJobs.dev.steps).toHaveLength(1);
    const [step] = devJobs.dev.steps;
    expect(step.uses).toBeUndefined();
    expect(step.run).toBe('sudo -n /usr/local/sbin/dues-deploy "$DEPLOY_SHA"');
    expect(step.env).toEqual({ DEPLOY_SHA: "${{ github.sha }}" });
  });

  it("shares the deploy queue with main and holds no token", () => {
    expect(dev.yaml.concurrency).toEqual(deploy.yaml.concurrency);
    expect(dev.yaml.concurrency).toEqual({ group: "deploy", "cancel-in-progress": false });
    expect(dev.yaml.permissions).toEqual({});
  });
});
