import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/src/db/index";
import { auditLog, bills, expenses } from "@/src/db/schema";
import { createBooks, type Result } from "./books";
import { type Actor, MAKERSPACE } from "./core";

// Entry without a bill through Books' Interface against a real Postgres (DATABASE_URL): expense-tracking "Entry without
// a bill", "Bill kinds and remarks", "Expense corrections and their lock", "Advance balance"; FUNCTIONAL W1. Every
// figure is the spec's, typed by hand. Fresh Claimants in every test. The lock on a submitted Claim is core.test.ts's
// (no Claims table yet).

const NOW = new Date("2026-11-27T10:00:00.000Z");
const jobs: unknown[] = [];
const books = createBooks({ db, now: () => NOW, enqueue: async (_tx, job) => void jobs.push(job) });
const claimant = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant"], via: "session" });
const rupees = (paise: number) => ({ paise, currency: "INR" as const });

const ok = (result: Result) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result;
};
const cash = async (actor: Actor) => {
  const event = ok(await books.execute(actor, { type: "CreatePaymentMethod", label: "Cash" })).events[0];
  if (event?.type !== "PaymentMethodCreated") throw new Error("expected PaymentMethodCreated");
  return event.paymentMethodId;
};
type Entry = { paidOn?: string; paymentMethodId?: string; fundId?: string; purposeId?: string; remarks?: string; whatFor?: string };
const add = (actor: Actor, entry: Entry = {}) =>
  books.execute(actor, { type: "LogNoBillEntry", kind: "service", amount: rupees(6000), paidOn: "2026-11-27", whatFor: "Auto to hardware market", ...entry });
const added = async (actor: Actor, entry: Entry = {}) => {
  const [logged, bill] = ok(await add(actor, entry)).events;
  if (logged?.type !== "ExpenseLogged" || bill?.type !== "BillAdded") throw new Error("expected ExpenseLogged and BillAdded");
  return { expenseId: logged.expenseId, billId: bill.billId };
};
const read = async (actor: Actor, id: string) => {
  const result = await books.expense(actor, id);
  if (!result.ok) throw new Error(`expected the Expense, got ${JSON.stringify(result)}`);
  return result.expense;
};

beforeAll(() => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
});
afterAll(() => pool.end());

describe("Entry without a bill", () => {
  it("Cash ride: ₹60.00 \"Auto to hardware market\" in Makerspace, Cash: an open Expense of ₹60.00, kind service, and one ready No bill of ₹60.00, \"No bill (cash)\"", async () => {
    const mickey = claimant();
    const paidCash = await cash(mickey);
    const { expenseId, billId } = await added(mickey, { paymentMethodId: paidCash });
    expect(await read(mickey, expenseId)).toMatchObject({
      status: "open",
      amount: rupees(6000),
      openAmount: rupees(0),
      reason: null, // never "bill missing"
      kind: "service",
      whatFor: "Auto to hardware market",
      fundId: MAKERSPACE,
      purposeId: null,
      paymentMethodId: paidCash,
      bills: [{ id: billId, kind: "no_bill", amount: rupees(6000), remarks: "No bill (cash)", fulfilledOn: "2026-11-27", status: "ready" }],
    });
    expect((await books.paymentMethods(mickey)).ok && (await books.paymentMethods(mickey))).toMatchObject({ paymentMethods: [{ id: paidCash, label: "Cash" }] });
    const audit = await db.select().from(auditLog).where(eq(auditLog.actorId, mickey.claimantId)).orderBy(auditLog.id);
    expect(audit.slice(-2).map((r) => [r.command, r.event, r.entity, r.fromState, r.toState])).toEqual([
      ["LogNoBillEntry", "ExpenseLogged", "expense", null, "open"],
      ["LogNoBillEntry", "BillAdded", "bill", null, "ready"],
    ]);
  });

  it("Past date: set to a day last week, the entry takes that date", async () => {
    const mickey = claimant();
    const { expenseId } = await added(mickey, { paidOn: "2026-11-20" });
    expect(await read(mickey, expenseId)).toMatchObject({ paidOn: "2026-11-20", bills: [{ fulfilledOn: "2026-11-20", status: "ready" }] });
  });

  it("Nothing to match or review: no document, bill number, order reference or UPI reference, and nothing is enqueued", async () => {
    const mickey = claimant();
    const before = jobs.length;
    const { expenseId, billId } = await added(mickey);
    expect(await read(mickey, expenseId)).toMatchObject({ orderRef: null, upiRef: null, bills: [{ billNo: null, billDate: null, differs: false }] });
    expect(await db.select({ paperlessId: bills.paperlessId }).from(bills).where(eq(bills.id, billId))).toEqual([{ paperlessId: null }]);
    expect(jobs.length).toBe(before);
  });

  it("Not waiting for an invoice: it is not bill missing and its Bill is ready, so it is in Ready to file and not in Waiting for invoice", async () => {
    const mickey = claimant();
    const { expenseId } = await added(mickey);
    const expense = await read(mickey, expenseId);
    expect(expense.reason).toBeNull();
    expect(expense.bills.map((b) => b.status)).toEqual(["ready"]);
  });

  it("Editable until submitted: the amount ₹60.00 → ₹70.00 while ready changes the Payment and its No bill, audited", async () => {
    const mickey = claimant();
    const { expenseId, billId } = await added(mickey);
    ok(await books.execute(mickey, { type: "CorrectExpense", expenseId, amount: rupees(7000) }));
    expect(await read(mickey, expenseId)).toMatchObject({ amount: rupees(7000), openAmount: rupees(0), bills: [{ amount: rupees(7000), status: "ready" }] });
    const audit = await db.select().from(auditLog).where(eq(auditLog.command, "CorrectExpense")).orderBy(auditLog.id);
    expect(audit.filter((r) => r.entityId === expenseId || r.entityId === billId).map((r) => r.event)).toEqual(["ExpenseCorrected", "BillCorrected"]);
    // And the remark, editable too, but never blank.
    ok(await books.execute(mickey, { type: "CorrectBill", billId, remarks: "No bill (auto fare)" }));
    expect(await books.execute(mickey, { type: "CorrectBill", billId, remarks: " " })).toEqual({ ok: false, reason: "validation", field: "remarks" });
    expect(await read(mickey, expenseId)).toMatchObject({ bills: [{ remarks: "No bill (auto fare)" }] });
  });

  it("Editable until submitted: the date moved to 20 Nov moves its No bill's Fulfilled date too, audited", async () => {
    const mickey = claimant();
    const { expenseId, billId } = await added(mickey);
    ok(await books.execute(mickey, { type: "CorrectExpense", expenseId, paidOn: "2026-11-20" }));
    expect(await read(mickey, expenseId)).toMatchObject({ paidOn: "2026-11-20", bills: [{ fulfilledOn: "2026-11-20", status: "ready" }] });
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, billId)).orderBy(auditLog.id);
    expect(audit.at(-1)).toMatchObject({ command: "CorrectExpense", event: "BillCorrected", payload: { changes: { fulfilledOn: { from: "2026-11-27", to: "2026-11-20" } } } });
  });

  it("Counts against the Advance: a ₹60.00 entry in Makerspace with ₹10,000.00 on leaves ₹9,940.00", async () => {
    const mickey = claimant();
    ok(await books.execute(mickey, { type: "SetAdvance", fundId: MAKERSPACE, total: rupees(1_000_000) }));
    await added(mickey);
    const read = await books.advances(mickey);
    expect(read.ok && read.advances.find((b) => b.fundId === MAKERSPACE)).toMatchObject({ total: rupees(1_000_000), left: rupees(994_000), state: "green" });
  });

  it("Several entries, no shortcut: three entries for one day are three Expenses, each its own", async () => {
    const mickey = claimant();
    const three = [await added(mickey), await added(mickey, { whatFor: "Auto back to the lab" }), await added(mickey, { whatFor: "Rickshaw to the post office" })];
    expect(new Set(three.map((e) => e.expenseId)).size).toBe(3);
    expect(await db.select({ paidOn: expenses.paidOn }).from(expenses).where(eq(expenses.claimantId, mickey.claimantId))).toEqual([
      { paidOn: "2026-11-27" },
      { paidOn: "2026-11-27" },
      { paidOn: "2026-11-27" },
    ]);
    for (const { expenseId } of three) expect(await read(mickey, expenseId)).toMatchObject({ amount: rupees(6000), bills: [{ status: "ready" }] });
  });

  it("goes where the prompt preselects, or into the Fund and Purpose named", async () => {
    const mickey = claimant();
    const travel = ok(await books.execute(mickey, { type: "CreateFund", name: "Travel grant" })).events[0];
    if (travel?.type !== "FundCreated") throw new Error("expected FundCreated");
    const trip = ok(await books.execute(mickey, { type: "CreatePurpose", name: "Robotics trip", fundId: travel.fundId })).events[0];
    if (trip?.type !== "PurposeCreated") throw new Error("expected PurposeCreated");
    // The one active Purpose is preselected, in its Fund (expense-tracking "Purpose").
    expect(await read(mickey, (await added(mickey)).expenseId)).toMatchObject({ fundId: travel.fundId, purposeId: trip.purposeId });
    expect(await read(mickey, (await added(mickey, { fundId: MAKERSPACE })).expenseId)).toMatchObject({ fundId: MAKERSPACE, purposeId: null });
  });

  it("refuses blank remarks as validation, and another Claimant's Fund, Purpose or Payment method as not_found, writing nothing", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const theirs = await cash(dexter);
    const fund = ok(await books.execute(dexter, { type: "CreateFund", name: "Travel grant" })).events[0];
    if (fund?.type !== "FundCreated") throw new Error("expected FundCreated");
    expect(await add(mickey, { remarks: "" })).toEqual({ ok: false, reason: "validation", field: "remarks" });
    for (const entry of [{ paymentMethodId: theirs }, { paymentMethodId: randomUUID() }, { fundId: fund.fundId }, { purposeId: randomUUID() }])
      expect(await add(mickey, entry), JSON.stringify(entry)).toEqual({ ok: false, reason: "not_found" });
    for (const id of ["constructor", "__proto__", "toString"])
      for (const entry of [{ paymentMethodId: id }, { fundId: id }, { purposeId: id }]) expect(await add(mickey, entry), JSON.stringify(entry)).toEqual({ ok: false, reason: "not_found" });
    expect(await db.select().from(expenses).where(eq(expenses.claimantId, mickey.claimantId))).toEqual([]);
  });

  it("a role-less Actor is forbidden", async () => {
    expect(await add({ ...claimant(), roles: [] })).toEqual({ ok: false, reason: "forbidden" });
  });
});
