import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@/src/db/index";
import { auditLog } from "@/src/db/schema";
import { createBooks, type Result } from "./books";
import type { Actor } from "./core";
import { type CreateFund, MAKERSPACE } from "./funds";

// Fund scenarios through Books' Interface against a real Postgres (DATABASE_URL): claims "Funds define how a Claim is
// made", identity-access "Fund sharing and edit rights", expense-tracking "Funds on the upload prompt".
// Every test uses fresh Claimants; Makerspace is the one Fund they all share.

const NOW = new Date("2026-11-27T10:00:00.000Z");
const books = createBooks({ db, now: () => NOW, enqueue: async () => {} });
const claimant = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant"], via: "session" });
const admin = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant", "admin"], via: "session" });

const mail = (to: string, subject = "Claim {claim_name}") => ({ to: [to], cc: [], subject, body: "{breakdown}" });
const travelGrant = (extra: Partial<CreateFund> = {}): CreateFund => ({
  type: "CreateFund",
  name: "Travel grant",
  mail: mail("grants@toontown.example.org", "Travel claim {claim_name}"),
  notes: "Ask Goofy before filing",
  formTemplate: "travel-form.docx",
  fileNamePattern: "{what} {n}",
  claimNamePattern: "Travel{n}",
  whatForHint: "e.g. bus to the robotics meet",
  ...extra,
});
const ok = (result: Result) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result;
};
const created = async (actor: Actor, extra: Partial<CreateFund> = {}) => {
  const event = ok(await books.execute(actor, travelGrant(extra))).events[0];
  if (event?.type !== "FundCreated") throw new Error("expected FundCreated");
  return event.fundId;
};
const listed = async (actor: Actor) => {
  const read = await books.funds(actor);
  if (!read.ok) throw new Error(`expected funds, got ${JSON.stringify(read)}`);
  return read.funds;
};
const only = (ids: string[], list: { id: string }[]) => list.map((f) => f.id).filter((id) => ids.includes(id));
const auditOf = (fundId: string) => db.select().from(auditLog).where(eq(auditLog.entityId, fundId)).orderBy(auditLog.id);

beforeAll(() => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
});
afterAll(() => pool.end());

describe("Makerspace is a Fund", () => {
  it("a Claimant who signs in for the first time has Makerspace, a team Fund, first in their order", async () => {
    const mickey = claimant();
    const read = await books.funds(mickey);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.funds[0]).toMatchObject({
      id: MAKERSPACE,
      name: "Makerspace",
      sharing: "team",
      archived: false,
      hidden: false,
      effective: { fileNamePattern: "{purpose} - {what} {kind}", claimNamePattern: "{Month}{n}" },
    });
  });
});

describe("Fund sharing and edit rights", () => {
  it("Private by default: only its creator sees and uses a new Fund; to anyone else it is not_found", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const fundId = await created(mickey);

    // Other tests' team Funds share this database, so only these two are compared.
    expect(only([MAKERSPACE, fundId], await listed(mickey))).toEqual([MAKERSPACE, fundId]);
    expect((await listed(mickey)).find((f) => f.id === fundId)).toMatchObject({
      name: "Travel grant",
      notes: "Ask Goofy before filing",
      sharing: "private",
      mayEditTeam: true,
      effective: {
        mail: mail("grants@toontown.example.org", "Travel claim {claim_name}"),
        formTemplate: "travel-form.docx",
        fileNamePattern: "{what} {n}",
        claimNamePattern: "Travel{n}",
        whatForHint: "e.g. bus to the robotics meet",
      },
    });
    expect((await listed(dexter)).map((f) => f.id)).not.toContain(fundId);
    expect(await books.execute(dexter, { type: "EditFund", fundId, name: "Mine now" })).toEqual({ ok: false, reason: "not_found" });
    expect(await books.fundTemplates(dexter, fundId)).toEqual({ ok: false, reason: "not_found" });
    expect(await auditOf(fundId)).toMatchObject([
      { actorId: mickey.claimantId, ownerId: mickey.claimantId, command: "CreateFund", event: "FundCreated", entity: "fund", toState: "private" },
    ]);
  });
});
