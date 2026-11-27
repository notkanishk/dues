import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/src/db/index";
import { auditLog } from "@/src/db/schema";
import { createBooks, type Result } from "./books";
import type { Actor } from "./core";

// Purpose scenarios through Books' Interface against a real Postgres (DATABASE_URL): expense-tracking "Purpose",
// "Funds on the upload prompt", "Expense ownership and fields". Fresh Claimants in every test.

const NOW = new Date("2026-11-27T10:00:00.000Z");
const books = createBooks({ db, now: () => NOW, enqueue: async () => {} });
const claimant = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant"], via: "session" });
const admin = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant", "admin"], via: "session" });

const ok = (result: Result) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result;
};
/** A private Fund of the Actor's, "Travel grant" unless named. */
const fund = async (actor: Actor, name = "Travel grant") => {
  const event = ok(await books.execute(actor, { type: "CreateFund", name })).events[0];
  if (event?.type !== "FundCreated") throw new Error("expected FundCreated");
  return event.fundId;
};
const purpose = async (actor: Actor, fundId: string, name = "Robotics trip") => {
  const event = ok(await books.execute(actor, { type: "CreatePurpose", name, fundId })).events[0];
  if (event?.type !== "PurposeCreated") throw new Error("expected PurposeCreated");
  return event.purposeId;
};
const purposesOf = async (actor: Actor) => {
  const read = await books.purposes(actor);
  if (!read.ok) throw new Error(`expected purposes, got ${JSON.stringify(read)}`);
  return read.purposes;
};
const auditOf = (id: string) => db.select().from(auditLog).where(eq(auditLog.entityId, id)).orderBy(auditLog.id);

beforeAll(() => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
});
afterAll(() => pool.end());

describe("Purpose", () => {
  it("New Purpose: \"Robotics trip\" in the Fund \"Travel grant\" belongs to that Fund and is active", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    const result = ok(await books.execute(mickey, { type: "CreatePurpose", name: "Robotics trip", fundId: travel }));
    expect(result.events).toEqual([
      { type: "PurposeCreated", purposeId: expect.any(String), claimantId: mickey.claimantId, fundId: travel, name: "Robotics trip" },
    ]);
    const id = (result.events[0] as { purposeId: string }).purposeId;
    expect(await purposesOf(mickey)).toEqual([{ id, name: "Robotics trip", fundId: travel, active: true }]);
    expect(await auditOf(id)).toMatchObject([
      { command: "CreatePurpose", event: "PurposeCreated", entity: "purpose", actorId: mickey.claimantId, ownerId: mickey.claimantId, fromState: null, toState: "active" },
    ]);
  });

  it("zero or more Purposes are active at once, in Makerspace too", async () => {
    const mickey = claimant();
    expect(await purposesOf(mickey)).toEqual([]);
    const travel = await fund(mickey);
    const trip = await purpose(mickey, travel);
    const week = await purpose(mickey, "00000000-0000-7000-8000-000000000001", "O-week stall");
    expect(await purposesOf(mickey)).toEqual([
      { id: trip, name: "Robotics trip", fundId: travel, active: true },
      { id: week, name: "O-week stall", fundId: "00000000-0000-7000-8000-000000000001", active: true },
    ]);
  });

  it("End trip: the Purpose is no longer active; ending it again is invalid_transition", async () => {
    const mickey = claimant();
    const trip = await purpose(mickey, await fund(mickey));
    expect(ok(await books.execute(mickey, { type: "EndPurpose", purposeId: trip })).events).toEqual([{ type: "PurposeEnded", purposeId: trip }]);
    expect(await purposesOf(mickey)).toMatchObject([{ id: trip, active: false }]);
    expect((await auditOf(trip)).at(-1)).toMatchObject({ command: "EndPurpose", fromState: "active", toState: "ended" });
    expect(await books.execute(mickey, { type: "EndPurpose", purposeId: trip })).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("refuses a blank name as validation, and a Fund the Claimant does not have as not_found, the same as one that does not exist", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const travel = await fund(mickey);
    expect(await books.execute(mickey, { type: "CreatePurpose", name: "  ", fundId: travel })).toEqual({ ok: false, reason: "validation", field: "name" });
    expect(await books.execute(dexter, { type: "CreatePurpose", name: "Robotics trip", fundId: travel })).toEqual({ ok: false, reason: "not_found" });
    expect(await books.execute(dexter, { type: "CreatePurpose", name: "Robotics trip", fundId: randomUUID() })).toEqual({ ok: false, reason: "not_found" });
    expect(await books.execute(dexter, { type: "CreatePurpose", name: "Robotics trip", fundId: "not-a-uuid" })).toEqual({ ok: false, reason: "not_found" });
    expect(await purposesOf(mickey)).toEqual([]);
    expect(await purposesOf(dexter)).toEqual([]);
  });

  it("a Purpose in a shared Fund is still its Claimant's alone", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const travel = await fund(mickey);
    ok(await books.execute(mickey, { type: "ShareFund", fundId: travel }));
    const theirs = await purpose(dexter, travel, "Dexter's lab visit");
    expect(await purposesOf(mickey)).toEqual([]);
    expect(await purposesOf(dexter)).toMatchObject([{ id: theirs, fundId: travel }]);
  });
});

describe("Purpose access", () => {
  it("Other Claimants excluded: another Claimant's Purpose is not listed, and ending it is not_found, the same as one that does not exist", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const trip = await purpose(mickey, await fund(mickey));
    const rows = (await auditOf(trip)).length;
    expect(await purposesOf(dexter)).toEqual([]);
    expect(await books.execute(dexter, { type: "EndPurpose", purposeId: trip })).toEqual({ ok: false, reason: "not_found" });
    expect(await books.execute(dexter, { type: "EndPurpose", purposeId: randomUUID() })).toEqual({ ok: false, reason: "not_found" });
    expect(await purposesOf(mickey)).toMatchObject([{ id: trip, active: true }]);
    expect((await auditOf(trip)).length).toBe(rows);
  });

  it("an admin by session sees and ends another Claimant's Purpose, audited with the admin as actor and the Claimant as owner; over MCP or Intake it is not_found", async () => {
    const [mickey, minnie] = [claimant(), admin()];
    const trip = await purpose(mickey, await fund(mickey));
    for (const via of ["mcp", "intake"] as const) {
      const remote = { ...minnie, via };
      expect((await books.purposes(remote)).ok && (await purposesOf(remote)).some((p) => p.id === trip)).toBe(false);
      expect(await books.execute(remote, { type: "EndPurpose", purposeId: trip })).toEqual({ ok: false, reason: "not_found" });
    }
    expect((await purposesOf(minnie)).find((p) => p.id === trip)).toEqual({ id: trip, name: "Robotics trip", fundId: expect.any(String), active: true });
    ok(await books.execute(minnie, { type: "EndPurpose", purposeId: trip }));
    expect(await purposesOf(mickey)).toMatchObject([{ id: trip, active: false }]);
    expect((await auditOf(trip)).at(-1)).toMatchObject({ command: "EndPurpose", actorId: minnie.claimantId, ownerId: mickey.claimantId });
  });

  it("a role-less Actor is forbidden from every Purpose command and query", async () => {
    const roleless: Actor = { claimantId: randomUUID(), roles: ["admin"], via: "session" };
    const forbidden = { ok: false, reason: "forbidden" };
    expect(await books.execute(roleless, { type: "CreatePurpose", name: "Robotics trip", fundId: "00000000-0000-7000-8000-000000000001" })).toEqual(forbidden);
    expect(await books.execute(roleless, { type: "EndPurpose", purposeId: randomUUID() })).toEqual(forbidden);
    expect(await books.purposes(roleless)).toEqual(forbidden);
  });
});
