import { afterEach, describe, expect, it, vi } from "vitest";

// Needs a real Postgres: DATABASE_URL (CI service container, or `docker run postgres:19.0` locally).
const realUrl = process.env.DATABASE_URL;

async function getHealth(databaseUrl: string) {
  vi.resetModules();
  process.env.DATABASE_URL = databaseUrl;
  const { GET } = await import("./route");
  return GET();
}

afterEach(() => {
  process.env.DATABASE_URL = realUrl;
});

describe("GET /api/health", () => {
  it("is 200 when Postgres is reachable", async () => {
    if (!realUrl) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
    const res = await getHealth(realUrl);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("is 503 when Postgres is not reachable", async () => {
    const res = await getHealth("postgres://nobody:nothing@127.0.0.1:1/none");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "database_unreachable" });
  });
});
