import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/src/db/index";
import { auditLog } from "@/src/db/schema";
import { createBooks, type Result } from "./books";
import { type Actor, type LogExpense, MAKERSPACE } from "./core";

// The Advance through Books' Interface against a real Postgres (DATABASE_URL): identity-access "Advance is a personal
// amount on a Fund"; expense-tracking "Advance balance", "Home lists and the Advance block", "Funds and Purposes work with
// the Advance on or off", "Closing what is left of an Order". Every figure is the spec's, typed by hand. Fresh Claimants.

const NOW = new Date("2026-11-27T10:00:00.000Z");
const books = createBooks({ db, now: () => NOW, enqueue: async () => {} });
const claimant = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant"], via: "session" });
const admin = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant", "admin"], via: "session" });
const rupees = (paise: number) => ({ paise, currency: "INR" as const });

const ok = (result: Result) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result;
};
const fund = async (actor: Actor, name = "Travel grant") => {
  const event = ok(await books.execute(actor, { type: "CreateFund", name })).events[0];
  if (event?.type !== "FundCreated") throw new Error("expected FundCreated");
  return event.fundId;
};
/** A Payment in a Fund: a shop Expense, or an online Order. Returns the Expense and its first Bill. */
const pay = async (actor: Actor, fundId: string, paise: number, kind: LogExpense["kind"] = "shop") => {
  const events = ok(await books.execute(actor, { type: "LogExpense", kind, amount: rupees(paise), paidOn: "2026-11-26", payee: "Gizmo Parts Bazaar", fundId })).events;
  const [logged, bill] = events;
  if (logged?.type !== "ExpenseLogged" || bill?.type !== "BillAdded") throw new Error("expected ExpenseLogged and BillAdded");
  return { expenseId: logged.expenseId, billId: bill.billId };
};
const setAdvance = (actor: Actor, fundId: string, paise: number | null) =>
  books.execute(actor, { type: "SetAdvance", fundId, total: paise === null ? null : rupees(paise) });
const blocks = async (actor: Actor) => {
  const read = await books.advances(actor);
  if (!read.ok) throw new Error(`expected advances, got ${JSON.stringify(read)}`);
  return read.advances;
};
const blockOf = async (actor: Actor, fundId: string) => (await blocks(actor)).find((b) => b.fundId === fundId);
const leftOf = async (actor: Actor, fundId: string) => (await blockOf(actor, fundId))?.left?.paise;
const advanceAudit = (actor: Actor) =>
  db.select().from(auditLog).where(and(eq(auditLog.actorId, actor.claimantId), eq(auditLog.entity, "advance"))).orderBy(auditLog.id);

beforeAll(() => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
});
afterAll(() => pool.end());

describe("Advance is a personal amount on a Fund", () => {
  it("Default off: a new Claimant's Advance is off on every Fund, and every block is hidden", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    expect(await blocks(mickey)).toEqual([
      { fundId: MAKERSPACE, name: "Makerspace", total: null, left: null, state: "hidden" },
      { fundId: travel, name: "Travel grant", total: null, left: null, state: "hidden" },
    ]);
  });

  it("Turn on: ₹10,000.00 on Makerspace makes the total ₹10,000.00, audited as AdvanceTurnedOn off → on", async () => {
    const mickey = claimant();
    expect(ok(await setAdvance(mickey, MAKERSPACE, 1_000_000)).events).toEqual([
      { type: "AdvanceTurnedOn", fundId: MAKERSPACE, claimantId: mickey.claimantId, total: rupees(1_000_000) },
    ]);
    expect(await blockOf(mickey, MAKERSPACE)).toEqual({ fundId: MAKERSPACE, name: "Makerspace", total: rupees(1_000_000), left: rupees(1_000_000), state: "green" });
    expect(await advanceAudit(mickey)).toMatchObject([
      { command: "SetAdvance", event: "AdvanceTurnedOn", entityId: MAKERSPACE, ownerId: mickey.claimantId, fromState: "off", toState: "on" },
    ]);
  });

  it("Edit the total: ₹10,000.00 to ₹15,000.00 is the total and no top-up record; the audit log keeps the change", async () => {
    const mickey = claimant();
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    await pay(mickey, MAKERSPACE, 250_000);
    expect(ok(await setAdvance(mickey, MAKERSPACE, 1_500_000)).events).toEqual([
      { type: "AdvanceTotalChanged", fundId: MAKERSPACE, claimantId: mickey.claimantId, from: rupees(1_000_000), to: rupees(1_500_000) },
    ]);
    // The total is replaced, not topped up: ₹15,000.00 − ₹2,500.00.
    expect(await blockOf(mickey, MAKERSPACE)).toMatchObject({ total: rupees(1_500_000), left: rupees(1_250_000) });
    expect((await advanceAudit(mickey)).map((r) => [r.event, r.fromState, r.toState])).toEqual([
      ["AdvanceTurnedOn", "off", "on"],
      ["AdvanceTotalChanged", "on", "on"],
    ]);
    // The same total again changes nothing and writes nothing.
    expect(ok(await setAdvance(mickey, MAKERSPACE, 1_500_000)).events).toEqual([]);
    expect(await advanceAudit(mickey)).toHaveLength(2);
  });

  it("Turn off: the block is hidden; turning it on again starts from the total entered then", async () => {
    const mickey = claimant();
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    expect(ok(await setAdvance(mickey, MAKERSPACE, null)).events).toEqual([{ type: "AdvanceTurnedOff", fundId: MAKERSPACE, claimantId: mickey.claimantId }]);
    expect(await blockOf(mickey, MAKERSPACE)).toEqual({ fundId: MAKERSPACE, name: "Makerspace", total: null, left: null, state: "hidden" });
    expect(ok(await setAdvance(mickey, MAKERSPACE, null)).events).toEqual([]); // already off: nothing changes
    ok(await setAdvance(mickey, MAKERSPACE, 500_000));
    expect(await blockOf(mickey, MAKERSPACE)).toMatchObject({ total: rupees(500_000), state: "green" });
    expect((await advanceAudit(mickey)).map((r) => [r.event, r.fromState, r.toState])).toEqual([
      ["AdvanceTurnedOn", "off", "on"],
      ["AdvanceTurnedOff", "on", "off"],
      ["AdvanceTurnedOn", "off", "on"],
    ]);
  });

  it("Never shared: on a team Fund one Claimant's Advance is not another's, and theirs is unaffected", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    ok(await setAdvance(dexter, MAKERSPACE, 300_000));
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    await pay(mickey, MAKERSPACE, 250_000);
    expect(await blockOf(dexter, MAKERSPACE)).toMatchObject({ total: rupees(300_000), left: rupees(300_000) });
    expect(await blockOf(mickey, MAKERSPACE)).toMatchObject({ total: rupees(1_000_000), left: rupees(750_000) });
    ok(await setAdvance(mickey, MAKERSPACE, null));
    expect(await blockOf(dexter, MAKERSPACE)).toMatchObject({ total: rupees(300_000), state: "green" });
    // Courage has none: Makerspace is a team Fund, yet no Advance of anyone's shows on it.
    expect(await blockOf(claimant(), MAKERSPACE)).toMatchObject({ total: null, state: "hidden" });
  });

  it("is never visible to an admin by session either: an admin's blocks are their own Advance over their own Expenses", async () => {
    const [dexter, minnie] = [claimant(), admin()];
    ok(await setAdvance(dexter, MAKERSPACE, 300_000));
    await pay(dexter, MAKERSPACE, 100_000);
    expect(await blockOf(minnie, MAKERSPACE)).toMatchObject({ total: null, state: "hidden" });
    ok(await setAdvance(minnie, MAKERSPACE, 1_000_000));
    expect(await blockOf(minnie, MAKERSPACE)).toMatchObject({ total: rupees(1_000_000), left: rupees(1_000_000) }); // Dexter's ₹1,000.00 not in it
    expect(await blockOf(dexter, MAKERSPACE)).toMatchObject({ total: rupees(300_000), left: rupees(200_000) }); // and Minnie's turn-on not in his
  });

  it("is set only on a Fund the Claimant has: another's private Fund or none is not_found; a bad total is validation", async () => {
    const [mickey, dexter, minnie] = [claimant(), claimant(), admin()];
    const travel = await fund(mickey);
    const audit = async () => (await db.select({ n: count() }).from(auditLog).where(eq(auditLog.entity, "advance")))[0]!.n;
    const before = await audit();
    expect(await setAdvance(dexter, travel, 1_000_000)).toEqual({ ok: false, reason: "not_found" });
    expect(await setAdvance(minnie, travel, 1_000_000)).toEqual({ ok: false, reason: "not_found" });
    expect(await setAdvance(dexter, randomUUID(), 1_000_000)).toEqual({ ok: false, reason: "not_found" });
    expect(await setAdvance(dexter, "constructor", 1_000_000)).toEqual({ ok: false, reason: "not_found" });
    for (const total of [rupees(-1), rupees(1.5), { paise: 100, currency: "USD" }, "10000", undefined])
      expect(await books.execute(mickey, { type: "SetAdvance", fundId: travel, total } as never)).toEqual({ ok: false, reason: "validation", field: "total" });
    expect(await audit()).toBe(before);
    expect(await blockOf(mickey, travel)).toMatchObject({ state: "hidden" });
  });

  it("refuses an Actor without the claimant role, for the command and the query", async () => {
    const roleless: Actor = { ...claimant(), roles: [] };
    expect(await setAdvance(roleless, MAKERSPACE, 1_000_000)).toEqual({ ok: false, reason: "forbidden" });
    expect(await books.advances(roleless)).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("Advance balance", () => {
  it("Payment lowers it: ₹10,000.00 total and a ₹2,500.00 Payment in Makerspace leave ₹7,500.00", async () => {
    const mickey = claimant();
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    await pay(mickey, MAKERSPACE, 250_000);
    expect(await leftOf(mickey, MAKERSPACE)).toBe(750_000);
  });

  it("Refund raises it: a ₹500.00 Refund on a Makerspace Expense marked received raises it by ₹500.00, not before", async () => {
    const mickey = claimant();
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    const { billId } = await pay(mickey, MAKERSPACE, 250_000, "online");
    const refund = ok(await books.execute(mickey, { type: "ExpectRefund", billId, amount: rupees(50_000) })).events.find((e) => e.type === "RefundExpected");
    if (refund?.type !== "RefundExpected") throw new Error("expected RefundExpected");
    expect(await leftOf(mickey, MAKERSPACE)).toBe(750_000); // expected is not received
    ok(await books.execute(mickey, { type: "MarkRefundReceived", refundId: refund.refundId, refundedOn: "2026-11-27" }));
    expect(await leftOf(mickey, MAKERSPACE)).toBe(800_000);
  });

  it("Other Fund untouched: a ₹4,000.00 Payment in \"Travel grant\", with no Advance on, leaves Makerspace's ₹7,500.00", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    await pay(mickey, MAKERSPACE, 250_000);
    await pay(mickey, travel, 400_000);
    expect(await leftOf(mickey, MAKERSPACE)).toBe(750_000);
    expect(await blockOf(mickey, travel)).toMatchObject({ state: "hidden", left: null });
  });

  it("Below zero: ₹10,000.00 total and ₹10,300.00 paid leave −₹300.00, and the block is red", async () => {
    const mickey = claimant();
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    await pay(mickey, MAKERSPACE, 1_030_000);
    expect(await blockOf(mickey, MAKERSPACE)).toMatchObject({ total: rupees(1_000_000), left: rupees(-30_000), state: "red" });
  });

  it("Moving an Expense from \"Travel grant\" into Makerspace lowers Makerspace by its Payment; moving it back raises it again", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    ok(await setAdvance(mickey, travel, 500_000));
    const { expenseId } = await pay(mickey, travel, 400_000);
    expect([await leftOf(mickey, MAKERSPACE), await leftOf(mickey, travel)]).toEqual([1_000_000, 100_000]);
    ok(await books.execute(mickey, { type: "CorrectExpense", expenseId, fundId: MAKERSPACE }));
    expect([await leftOf(mickey, MAKERSPACE), await leftOf(mickey, travel)]).toEqual([600_000, 500_000]);
    ok(await books.execute(mickey, { type: "CorrectExpense", expenseId, fundId: travel }));
    expect([await leftOf(mickey, MAKERSPACE), await leftOf(mickey, travel)]).toEqual([1_000_000, 100_000]);
  });

  it("Not claiming: with the Advance on, Advance left does not rise when ₹270.00 of an Order is written off", async () => {
    const mickey = claimant();
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    const { billId } = await pay(mickey, MAKERSPACE, 27_000, "online");
    ok(await books.execute(mickey, { type: "CloseOrder", billId, choice: "not_claiming" }));
    expect(await leftOf(mickey, MAKERSPACE)).toBe(973_000);
  });

  it("a written-off Refund does not raise it either: closing the Expense as written off leaves it where the Payment put it", async () => {
    const mickey = claimant();
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    const { expenseId, billId } = await pay(mickey, MAKERSPACE, 250_000, "online");
    const refund = ok(await books.execute(mickey, { type: "ExpectRefund", billId, amount: rupees(50_000) })).events.find((e) => e.type === "RefundExpected");
    if (refund?.type !== "RefundExpected") throw new Error("expected RefundExpected");
    ok(await books.execute(mickey, { type: "CloseExpense", expenseId, reason: "written_off", refunds: { [refund.refundId]: "written_off" } }));
    expect(await leftOf(mickey, MAKERSPACE)).toBe(750_000);
  });
});

describe("Home Advance block", () => {
  // ₹10,000.00 total; ₹15% of it is ₹1,500.00.
  const leftAt = async (left: number) => {
    const mickey = claimant();
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    await pay(mickey, MAKERSPACE, 1_000_000 - left);
    return (await blockOf(mickey, MAKERSPACE))!.state;
  };

  it("Green: ₹1,600.00 or more left of ₹10,000.00, and ₹1,500.01", async () => {
    expect(await leftAt(160_000)).toBe("green");
    expect(await leftAt(150_001)).toBe("green");
  });

  it("Amber: ₹1,500.00 left, 15% of ₹10,000.00, down to ₹0.00", async () => {
    expect(await leftAt(150_000)).toBe("amber");
    expect(await leftAt(0)).toBe("amber");
  });

  it("Red: below zero, from −₹0.01", async () => {
    expect(await leftAt(-1)).toBe("red");
  });

  it("One block per Fund: the Advance on for two Funds gives a block for each, in the Claimant's order", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    ok(await books.execute(mickey, { type: "OrderFunds", fundIds: [travel, MAKERSPACE] }));
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    ok(await setAdvance(mickey, travel, 500_000));
    expect((await blocks(mickey)).map((b) => [b.name, b.state])).toEqual([
      ["Travel grant", "green"],
      ["Makerspace", "green"],
    ]);
  });
});

describe("Funds and Purposes work with the Advance on or off", () => {
  it("Advance off: a Claimant still chooses Funds, uses Purposes and logs into each; turning it on changes neither", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    const trip = ok(await books.execute(mickey, { type: "CreatePurpose", name: "Robotics trip", fundId: travel })).events[0];
    if (trip?.type !== "PurposeCreated") throw new Error("expected PurposeCreated");
    const log = async () => {
      const { expenseId } = await pay(mickey, travel, 10_000);
      const read = await books.expense(mickey, expenseId);
      return read.ok && [read.expense.fundId, read.expense.purposeId];
    };
    const promptOff = await books.prompt(mickey);
    expect(await log()).toEqual([travel, trip.purposeId]);
    ok(await setAdvance(mickey, travel, 500_000));
    expect(await log()).toEqual([travel, trip.purposeId]);
    const promptOn = await books.prompt(mickey);
    if (!promptOff.ok || !promptOn.ok) throw new Error("expected prompts");
    expect(promptOn.purposes).toEqual(promptOff.purposes);
    expect(promptOn.funds.map((f) => f.id)).toEqual(promptOff.funds.map((f) => f.id));
    expect(promptOn.preselectedFundId).toBe(promptOff.preselectedFundId);
  });
});
