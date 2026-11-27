import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/src/db/index";
import { auditLog } from "@/src/db/schema";
import { createBooks, type Result } from "./books";
import { type Actor, type CloseReason, type LogExpense, MAKERSPACE } from "./core";

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
    // Other tests' team Funds are in the shared database too: every block is hidden, Makerspace and Travel grant among them.
    const all = await blocks(mickey);
    expect(all.every((b) => b.state === "hidden" && b.total === null && b.left === null)).toBe(true);
    expect(all.filter((b) => [MAKERSPACE, travel].includes(b.fundId))).toEqual([
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

describe("Closing an Expense with the Advance on", () => {
  // FUNCTIONAL §7: a duplicate is the same payment logged twice, so only one of the two is a Payment. W2.9: "With the
  // Advance on, the amount stays spent" for what is not claimed, so personal and written off stay counted.
  it.each([
    ["duplicate", "counts the payment once: two ₹2,500.00 Expenses, one closed as duplicate, leave ₹7,500.00", 750_000],
    ["personal", "stays spent: two ₹2,500.00 Expenses, one closed as personal, leave ₹5,000.00", 500_000],
    ["written_off", "stays spent: two ₹2,500.00 Expenses, one closed as written off, leave ₹5,000.00", 500_000],
  ] as const)("closed as %s %s", async (reason, _, left) => {
    const mickey = claimant();
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    await pay(mickey, MAKERSPACE, 250_000);
    const { expenseId } = await pay(mickey, MAKERSPACE, 250_000);
    expect(await leftOf(mickey, MAKERSPACE)).toBe(500_000);
    ok(await books.execute(mickey, { type: "CloseExpense", expenseId, reason, refunds: {} }));
    expect(await leftOf(mickey, MAKERSPACE)).toBe(left);
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
    expect((await blocks(mickey)).filter((b) => b.state !== "hidden").map((b) => [b.name, b.state])).toEqual([
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

describe("Funds on the upload prompt: the chip", () => {
  const chipOf = async (actor: Actor, fundId: string) => {
    const read = await books.prompt(actor);
    if (!read.ok) throw new Error(`expected prompt, got ${JSON.stringify(read)}`);
    return read.funds.find((f) => f.id === fundId)?.chip;
  };

  it("Chip with the Advance: \"Makerspace\" while off, \"Makerspace · Advance\" while on, and \"Makerspace\" again once off", async () => {
    const mickey = claimant();
    expect(await chipOf(mickey, MAKERSPACE)).toBe("Makerspace");
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    expect(await chipOf(mickey, MAKERSPACE)).toBe("Makerspace · Advance");
    ok(await setAdvance(mickey, MAKERSPACE, null));
    expect(await chipOf(mickey, MAKERSPACE)).toBe("Makerspace");
  });

  it("is the Claimant's own: another Claimant's Advance on Makerspace, an admin's included, leaves their chip \"Makerspace\"", async () => {
    const [mickey, dexter, minnie] = [claimant(), claimant(), admin()];
    ok(await setAdvance(mickey, MAKERSPACE, 1_000_000));
    expect(await chipOf(dexter, MAKERSPACE)).toBe("Makerspace");
    expect(await chipOf(minnie, MAKERSPACE)).toBe("Makerspace");
    ok(await setAdvance(minnie, MAKERSPACE, 1_000_000));
    expect(await chipOf(dexter, MAKERSPACE)).toBe("Makerspace");
  });

  it("names any Fund the same way: \"Travel grant · Advance\" with its Advance on", async () => {
    const mickey = claimant();
    const travel = await fund(mickey);
    ok(await setAdvance(mickey, travel, 500_000));
    expect(await chipOf(mickey, travel)).toBe("Travel grant · Advance");
    expect(await chipOf(mickey, MAKERSPACE)).toBe("Makerspace");
  });
});

// Property (expense-tracking "Advance balance"): for random command sequences across two Funds, every Advance left the
// query returns equals the formula worked out here from the commands Books accepted, independently of how Books stores
// or sums them: total − Σ Payments + Σ Refunds received (+ Σ Reimbursements received, none before Claims), where an
// Expense closed as duplicate is no Payment (FUNCTIONAL §7) and one closed as personal or written off still is (W2.9).
describe("Advance left, for any command sequence across two Funds", () => {
  // ponytail: a seeded generator instead of a property-testing dependency, as in core.test.ts; same seed, same runs.
  let seed = 0xad7a;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const pick = <T>(xs: readonly T[]) => xs[next() % xs.length]!;
  const amount = () => 1 + (next() % 500_000); // up to ₹5,000.00

  it("equals total − Σ Payments + Σ Refunds received, per Fund, after every step of 4 runs of 30 commands", async () => {
    const kinds = new Set<string>();
    for (let run = 0; run < 4; run++) {
      const mickey = claimant();
      const travel = await fund(mickey);
      const fundIds = [MAKERSPACE, travel];
      // Both on from the start, so most steps check a live Advance; SetAdvance turns one off a quarter of the time.
      const total: Record<string, number | null> = { [MAKERSPACE]: 1_000_000, [travel]: 500_000 };
      for (const fundId of fundIds) ok(await setAdvance(mickey, fundId, total[fundId]!));
      const model: {
        expenseId: string;
        billId: string;
        fundId: string;
        paise: number;
        /** An Order whose expected Bill is still there: a Refund can come from it. */
        awaiting: boolean;
        closed: CloseReason | null;
        refunds: { id: string; paise: number; received: boolean }[];
      }[] = [];
      for (let step = 0; step < 30; step++) {
        const expense = model.length ? pick(model) : undefined;
        // Any Refund still expected, on any Expense: picking an Expense first rarely lands on one.
        const expected = model.flatMap((e) => e.refunds.filter((r) => !r.received));
        const refund = expected.length ? pick(expected) : undefined;
        const roll = next() % 9;
        let result: Result;
        if (roll === 0) {
          const fundId = pick(fundIds);
          const paise = next() % 4 === 0 ? null : amount();
          result = await setAdvance(mickey, fundId, paise);
          if (result.ok) total[fundId] = paise;
          kinds.add(`SetAdvance:${result.ok}`);
        } else if (roll <= 2 || !expense) {
          const fundId = pick(fundIds);
          const online = next() % 2 === 0;
          const paise = amount();
          const made = await pay(mickey, fundId, paise, online ? "online" : "shop");
          model.push({ ...made, fundId, paise, awaiting: online, closed: null, refunds: [] });
          result = { ok: true, events: [] };
          kinds.add("LogExpense:true");
        } else if (roll === 3) {
          const fundId = pick(fundIds);
          result = await books.execute(mickey, { type: "CorrectExpense", expenseId: expense.expenseId, fundId });
          if (result.ok) expense.fundId = fundId;
          kinds.add(`CorrectExpense fund:${result.ok}`);
        } else if (roll === 4) {
          const paise = amount();
          result = await books.execute(mickey, { type: "CorrectExpense", expenseId: expense.expenseId, amount: rupees(paise) });
          if (result.ok) expense.paise = paise;
          kinds.add(`CorrectExpense amount:${result.ok}`);
        } else if (roll === 5) {
          // An open Order when there is one: closing would otherwise leave few Bills a Refund can come from.
          const open = model.filter((e) => e.awaiting && !e.closed);
          const order = open.length ? pick(open) : expense;
          const paise = 1 + (next() % Math.max(1, Math.floor(order.paise / 2)));
          result = await books.execute(mickey, { type: "ExpectRefund", billId: order.billId, amount: rupees(paise) });
          const made = result.ok ? result.events.find((e) => e.type === "RefundExpected") : undefined;
          if (made?.type === "RefundExpected") order.refunds.push({ id: made.refundId, paise, received: false });
          kinds.add(`ExpectRefund:${result.ok}`);
        } else if (roll === 6 && refund) {
          result = await books.execute(mickey, { type: "MarkRefundReceived", refundId: refund.id, refundedOn: "2026-11-27" });
          if (result.ok) refund.received = true;
          kinds.add(`MarkRefundReceived:${result.ok}`);
        } else if (roll === 7) {
          // Every expected Refund stays expected, so a later MarkRefundReceived may still reach it.
          const reason = pick(["duplicate", "personal", "written_off"] as const);
          const refunds = Object.fromEntries(expense.refunds.filter((r) => !r.received).map((r) => [r.id, "expected" as const]));
          result = await books.execute(mickey, { type: "CloseExpense", expenseId: expense.expenseId, reason, refunds });
          if (result.ok) expense.closed = reason;
          kinds.add(`CloseExpense ${reason}:${result.ok}`);
        } else {
          // Not claiming the rest of an Order: written off, never received.
          result = await books.execute(mickey, { type: "CloseOrder", billId: expense.billId, choice: "not_claiming" });
          if (result.ok) expense.awaiting = false;
          kinds.add(`CloseOrder:${result.ok}`);
        }
        if (!result.ok && !["invalid_transition", "validation", "not_found"].includes(result.reason)) throw new Error(JSON.stringify(result));

        const read = await blocks(mickey);
        for (const fundId of fundIds) {
          const t = total[fundId] ?? null;
          const mine = model.filter((e) => e.fundId === fundId);
          const payments = mine.reduce((s, e) => s + (e.closed === "duplicate" ? 0 : e.paise), 0);
          const received = mine.flatMap((e) => e.refunds).reduce((s, r) => s + (r.received ? r.paise : 0), 0);
          const expected = t === null ? null : rupees(t - payments + received);
          expect(read.find((b) => b.fundId === fundId)?.left, `run ${run}, step ${step}`).toEqual(expected);
        }
      }
    }
    // The sequences reach every money path, accepted: a Refund received, a move, an amount corrected, Not claiming.
    for (const k of ["SetAdvance:true", "CorrectExpense fund:true", "CorrectExpense amount:true", "ExpectRefund:true", "MarkRefundReceived:true", "CloseOrder:true", "CloseExpense duplicate:true", "CloseExpense personal:true", "CloseExpense written_off:true"])
      expect([...kinds], k).toContain(k);
  }, 120_000);
});
