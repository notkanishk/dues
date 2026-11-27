import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/src/db/index";
import { auditLog, expenses } from "@/src/db/schema";
import { createBooks, type Result } from "./books";
import { type Actor, MAKERSPACE } from "./core";

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
    expect(await purposesOf(mickey)).toEqual([{ id, claimantId: mickey.claimantId, name: "Robotics trip", fundId: travel, active: true }]);
    expect(await auditOf(id)).toMatchObject([
      { command: "CreatePurpose", event: "PurposeCreated", entity: "purpose", actorId: mickey.claimantId, ownerId: mickey.claimantId, fromState: null, toState: "active" },
    ]);
  });

  it("zero or more Purposes are active at once, in Makerspace too", async () => {
    const mickey = claimant();
    expect(await purposesOf(mickey)).toEqual([]);
    const travel = await fund(mickey);
    const trip = await purpose(mickey, travel);
    const week = await purpose(mickey, MAKERSPACE, "O-week stall");
    expect(await purposesOf(mickey)).toEqual([
      { id: trip, claimantId: mickey.claimantId, name: "Robotics trip", fundId: travel, active: true },
      { id: week, claimantId: mickey.claimantId, name: "O-week stall", fundId: MAKERSPACE, active: true },
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
    expect((await purposesOf(minnie)).find((p) => p.id === trip)).toEqual({ id: trip, claimantId: mickey.claimantId, name: "Robotics trip", fundId: expect.any(String), active: true });
    ok(await books.execute(minnie, { type: "EndPurpose", purposeId: trip }));
    expect(await purposesOf(mickey)).toMatchObject([{ id: trip, active: false }]);
    expect((await auditOf(trip)).at(-1)).toMatchObject({ command: "EndPurpose", actorId: minnie.claimantId, ownerId: mickey.claimantId });
  });

  it("a role-less Actor is forbidden from every Purpose command and query", async () => {
    const roleless: Actor = { claimantId: randomUUID(), roles: ["admin"], via: "session" };
    const forbidden = { ok: false, reason: "forbidden" };
    expect(await books.execute(roleless, { type: "CreatePurpose", name: "Robotics trip", fundId: MAKERSPACE })).toEqual(forbidden);
    expect(await books.execute(roleless, { type: "EndPurpose", purposeId: randomUUID() })).toEqual(forbidden);
    expect(await books.purposes(roleless)).toEqual(forbidden);
  });
});

const rupees = (paise: number) => ({ paise, currency: "INR" as const });
type Links = { fundId?: string; purposeId?: string | null; whatFor?: string };
const log = (actor: Actor, links: Links = {}) =>
  books.execute(actor, { type: "LogExpense", kind: "shop", amount: rupees(45000), paidOn: "2026-11-26", payee: "Bus depot", ...links });
const logged = async (actor: Actor, links: Links = {}) => {
  const event = ok(await log(actor, links)).events[0];
  if (event?.type !== "ExpenseLogged") throw new Error("expected ExpenseLogged");
  return event.expenseId;
};
const linksOf = async (actor: Actor, id: string) => {
  const read = await books.expense(actor, id);
  if (!read.ok) throw new Error(`expected the Expense, got ${JSON.stringify(read)}`);
  return { fundId: read.expense.fundId, purposeId: read.expense.purposeId, whatFor: read.expense.whatFor };
};
const expenseCount = async (actor: Actor) => (await db.select().from(expenses).where(eq(expenses.claimantId, actor.claimantId))).length;

describe("The Expense's Fund, Purpose and What for", () => {
  it("No Purpose: a ₹450.00 bus fare logged into \"Travel grant\" sits in that Fund with no group, its What for kept", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    const result = ok(await log(mickey, { fundId: travel, whatFor: "Bus to the robotics meet" }));
    expect(result.events[0]).toMatchObject({ type: "ExpenseLogged", fundId: travel, purposeId: null, whatFor: "Bus to the robotics meet" });
    expect(await linksOf(mickey, (result.events[0] as { expenseId: string }).expenseId)).toEqual({ fundId: travel, purposeId: null, whatFor: "Bus to the robotics meet" });
  });

  it("a payment logged into \"Robotics trip\" is in that Purpose and its Fund \"Travel grant\"", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    const trip = await purpose(mickey, travel);
    expect(await linksOf(mickey, await logged(mickey, { purposeId: trip }))).toEqual({ fundId: travel, purposeId: trip, whatFor: null });
    expect(await linksOf(mickey, await logged(mickey, { fundId: travel, purposeId: trip }))).toMatchObject({ fundId: travel, purposeId: trip });
  });

  it("with no Fund named and no Purpose active, the payment is in Makerspace with no Purpose", async () => {
    const mickey = claimant();
    expect(await linksOf(mickey, await logged(mickey))).toEqual({ fundId: MAKERSPACE, purposeId: null, whatFor: null });
  });

  it("refuses a Purpose of another Fund as validation, and writes nothing", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    const trip = await purpose(mickey, travel);
    const rows = await expenseCount(mickey);
    expect(await log(mickey, { fundId: MAKERSPACE, purposeId: trip })).toEqual({ ok: false, reason: "validation", field: "purposeId" });
    expect(await expenseCount(mickey)).toBe(rows);
  });

  it("another Claimant's private Fund or Purpose is not_found, the same as one that does not exist; a team Fund anyone may use", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const travel = await fund(mickey);
    const trip = await purpose(mickey, travel);
    const notFound = { ok: false, reason: "not_found" };
    for (const links of [{ fundId: travel }, { fundId: randomUUID() }, { fundId: "not-a-uuid" }, { purposeId: trip }, { purposeId: randomUUID() }, { fundId: travel, purposeId: trip }])
      expect(await log(dexter, links), JSON.stringify(links)).toEqual(notFound);
    const own = await logged(dexter);
    for (const links of [{ fundId: travel }, { fundId: randomUUID() }, { purposeId: trip }, { purposeId: randomUUID() }])
      expect(await books.execute(dexter, { type: "CorrectExpense", expenseId: own, ...links }), JSON.stringify(links)).toEqual(notFound);
    expect(await expenseCount(dexter)).toBe(1);
    ok(await books.execute(mickey, { type: "ShareFund", fundId: travel }));
    expect(await linksOf(dexter, await logged(dexter, { fundId: travel }))).toMatchObject({ fundId: travel, purposeId: null });
    expect(await log(dexter, { purposeId: trip })).toEqual(notFound); // the Fund is shared, the Purpose stays Mickey's
  });

  it("End trip: an ended Purpose catches no new payment by default, yet takes one named explicitly; its Expenses keep it", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    const trip = await purpose(mickey, travel);
    const fare = await logged(mickey, { purposeId: trip });
    ok(await books.execute(mickey, { type: "EndPurpose", purposeId: trip }));
    expect(await linksOf(mickey, fare)).toMatchObject({ fundId: travel, purposeId: trip });
    expect(await linksOf(mickey, await logged(mickey))).toMatchObject({ fundId: MAKERSPACE, purposeId: null });
    expect(await linksOf(mickey, await logged(mickey, { purposeId: trip }))).toMatchObject({ fundId: travel, purposeId: trip });
    const late = await logged(mickey);
    ok(await books.execute(mickey, { type: "CorrectExpense", expenseId: late, purposeId: trip }));
    expect(await linksOf(mickey, late)).toMatchObject({ fundId: travel, purposeId: trip });
  });

  it("CorrectExpense moves an Expense into a Purpose (its Fund follows) and out of it to another Fund, audited from and to", async () => {
    const mickey = claimant();
    const fare = await logged(mickey);
    const travel = await fund(mickey);
    const trip = await purpose(mickey, travel);
    const into = ok(await books.execute(mickey, { type: "CorrectExpense", expenseId: fare, purposeId: trip, whatFor: "Bus to the robotics meet" }));
    expect(into.events).toEqual([
      {
        type: "ExpenseCorrected",
        expenseId: fare,
        changes: { fundId: { from: MAKERSPACE, to: travel }, purposeId: { from: null, to: trip }, whatFor: { from: null, to: "Bus to the robotics meet" } },
      },
    ]);
    expect(await linksOf(mickey, fare)).toEqual({ fundId: travel, purposeId: trip, whatFor: "Bus to the robotics meet" });
    // A Purpose is inside its Fund: moving the Expense to Makerspace takes it out of "Robotics trip".
    const out = ok(await books.execute(mickey, { type: "CorrectExpense", expenseId: fare, fundId: MAKERSPACE }));
    expect(out.events).toEqual([{ type: "ExpenseCorrected", expenseId: fare, changes: { fundId: { from: travel, to: MAKERSPACE }, purposeId: { from: trip, to: null } } }]);
    expect(await linksOf(mickey, fare)).toMatchObject({ fundId: MAKERSPACE, purposeId: null });
    expect(await books.execute(mickey, { type: "CorrectExpense", expenseId: fare, fundId: MAKERSPACE, purposeId: trip })).toEqual({ ok: false, reason: "validation", field: "purposeId" });
    const audit = (await auditOf(fare)).filter((r) => r.event === "ExpenseCorrected");
    expect(audit.map((r) => r.payload)).toEqual([into.events[0], out.events[0]]);
  });

  it("an archived Fund still takes an Expense named into it, by LogExpense and CorrectExpense", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    const trip = await purpose(mickey, travel);
    ok(await books.execute(mickey, { type: "ArchiveFund", fundId: travel }));
    expect(await linksOf(mickey, await logged(mickey, { fundId: travel }))).toMatchObject({ fundId: travel, purposeId: null });
    const fare = await logged(mickey, { fundId: MAKERSPACE });
    ok(await books.execute(mickey, { type: "CorrectExpense", expenseId: fare, purposeId: trip }));
    expect(await linksOf(mickey, fare)).toMatchObject({ fundId: travel, purposeId: trip });
  });

  it("an Expense written without a Fund is refused by the database, never put in Makerspace", async () => {
    const mickey = claimant();
    await expect(db.execute(sql`insert into expenses (claimant_id) values (${mickey.claimantId})`)).rejects.toMatchObject({ cause: { code: "23502", column: "fund_id" } });
    expect(await expenseCount(mickey)).toBe(0);
  });

  it("an admin by session links another Claimant's Expense to that Claimant's Purpose, never to the admin's own", async () => {
    const [mickey, minnie] = [claimant(), admin()];
    const fare = await logged(mickey);
    const trip = await purpose(mickey, await fund(mickey));
    const hers = await fund(minnie, "Minnie's grant");
    const herTrip = await purpose(minnie, hers, "Minnie's trip");
    expect(await books.execute(minnie, { type: "CorrectExpense", expenseId: fare, fundId: hers })).toEqual({ ok: false, reason: "not_found" });
    expect(await books.execute(minnie, { type: "CorrectExpense", expenseId: fare, purposeId: herTrip })).toEqual({ ok: false, reason: "not_found" });
    ok(await books.execute(minnie, { type: "CorrectExpense", expenseId: fare, purposeId: trip }));
    expect(await linksOf(mickey, fare)).toMatchObject({ purposeId: trip });
    expect((await auditOf(fare)).at(-1)).toMatchObject({ command: "CorrectExpense", actorId: minnie.claimantId, ownerId: mickey.claimantId });
  });
});

describe("The prompt (prompt query): Funds in the Claimant's order, and the What for? step's Purposes", () => {
  const promptOf = async (actor: Actor) => {
    const read = await books.prompt(actor);
    if (!read.ok) throw new Error(`expected the prompt, got ${JSON.stringify(read)}`);
    return read;
  };

  it("Default order: a Claimant who has not ordered their Funds gets Makerspace first and preselected, and no Purpose step", async () => {
    const mickey = claimant();
    const prompt = await promptOf(mickey);
    expect(prompt.funds[0]).toEqual({ id: MAKERSPACE, name: "Makerspace", chip: "Makerspace", whatForHint: null });
    expect(prompt).toMatchObject({ preselectedFundId: MAKERSPACE, purposes: [], preselectedPurposeId: null });
  });

  it("Active Purpose preselects its Fund: with \"Robotics trip\" the only one active, \"Travel grant\" is preselected and the payment goes into it; one tap puts it elsewhere", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    const trip = await purpose(mickey, travel);
    expect(await promptOf(mickey)).toMatchObject({
      preselectedFundId: travel,
      purposes: [{ id: trip, name: "Robotics trip", fundId: travel }],
      preselectedPurposeId: trip,
    });
    expect(await linksOf(mickey, await logged(mickey))).toMatchObject({ fundId: travel, purposeId: trip });
    expect(await linksOf(mickey, await logged(mickey, { purposeId: null }))).toMatchObject({ fundId: travel, purposeId: null });
    expect(await linksOf(mickey, await logged(mickey, { fundId: MAKERSPACE }))).toMatchObject({ fundId: MAKERSPACE, purposeId: null });
  });

  it("Two active Purposes: the step offers both, plus None, and preselects no Purpose; the payment goes into none", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    const trip = await purpose(mickey, travel);
    const week = await purpose(mickey, MAKERSPACE, "O-week stall");
    expect(await promptOf(mickey)).toMatchObject({
      preselectedFundId: MAKERSPACE,
      purposes: [
        { id: trip, name: "Robotics trip", fundId: travel },
        { id: week, name: "O-week stall", fundId: MAKERSPACE },
      ],
      preselectedPurposeId: null,
    });
    expect(await linksOf(mickey, await logged(mickey))).toMatchObject({ fundId: MAKERSPACE, purposeId: null });
  });

  it("two active Purposes in one Fund preselect that Fund", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    await purpose(mickey, travel);
    await purpose(mickey, travel, "Science fair");
    expect(await promptOf(mickey)).toMatchObject({ preselectedFundId: travel, preselectedPurposeId: null });
    expect(await linksOf(mickey, await logged(mickey))).toMatchObject({ fundId: travel, purposeId: null });
  });

  it("No active Purpose: after End trip the step offers no Purpose and the payment has none", async () => {
    const mickey = claimant();
    const trip = await purpose(mickey, await fund(mickey));
    ok(await books.execute(mickey, { type: "EndPurpose", purposeId: trip }));
    expect(await promptOf(mickey)).toMatchObject({ preselectedFundId: MAKERSPACE, purposes: [], preselectedPurposeId: null });
    expect(await linksOf(mickey, await logged(mickey))).toMatchObject({ fundId: MAKERSPACE, purposeId: null });
  });

  it("Own order: \"Travel grant\" moved above Makerspace is first on that Claimant's prompt only; the Fund's hint is in effect", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const travel = await fund(mickey);
    ok(await books.execute(mickey, { type: "EditFund", fundId: travel, whatForHint: "e.g. soldering supplies" }));
    ok(await books.execute(mickey, { type: "ShareFund", fundId: travel }));
    ok(await books.execute(mickey, { type: "OrderFunds", fundIds: [travel, MAKERSPACE] }));
    const mine = await promptOf(mickey);
    expect(mine.funds.slice(0, 2)).toEqual([
      { id: travel, name: "Travel grant", chip: "Travel grant", whatForHint: "e.g. soldering supplies" },
      { id: MAKERSPACE, name: "Makerspace", chip: "Makerspace", whatForHint: null },
    ]);
    expect(mine.preselectedFundId).toBe(MAKERSPACE);
    expect((await promptOf(dexter)).funds[0]?.id).toBe(MAKERSPACE);
  });

  it("a hidden or archived Fund's Purposes stay off the prompt, and the payment does not go into them", async () => {
    const mickey = claimant();
    const hidden = await fund(mickey, "Science fair grant");
    const archived = await fund(mickey);
    await purpose(mickey, hidden, "Science fair");
    await purpose(mickey, archived);
    ok(await books.execute(mickey, { type: "HideFund", fundId: hidden, hidden: true }));
    ok(await books.execute(mickey, { type: "ArchiveFund", fundId: archived }));
    expect(await promptOf(mickey)).toMatchObject({ preselectedFundId: MAKERSPACE, purposes: [], preselectedPurposeId: null });
    expect(await linksOf(mickey, await logged(mickey))).toMatchObject({ fundId: MAKERSPACE, purposeId: null });
  });

  it("only the Claimant's own Purposes are on their prompt, an admin's included", async () => {
    const [mickey, minnie] = [claimant(), admin()];
    const trip = await purpose(mickey, await fund(mickey));
    expect(await promptOf(minnie)).toMatchObject({ purposes: [], preselectedPurposeId: null, preselectedFundId: MAKERSPACE });
    expect((await promptOf(mickey)).purposes.map((p) => p.id)).toEqual([trip]);
    expect(await books.prompt({ ...mickey, roles: [] })).toEqual({ ok: false, reason: "forbidden" });
  });
});
