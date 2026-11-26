import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/src/db/index";
import { auditLog, bills, expenses, refunds } from "@/src/db/schema";
import { createBooks, lockClaimant, type Result } from "./books";
import type { Actor, LogExpense } from "./core";

// Scenario tests through Books' Interface against a real Postgres (DATABASE_URL), design §1.
// Every test uses fresh Claimants, so counts are exact while other test files share the database.

const NOW = new Date("2026-11-20T10:00:00.000Z");
const jobs: unknown[] = [];
const books = createBooks({ db, now: () => NOW, enqueue: async (_tx, job) => void jobs.push(job) });

const claimant = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant"], via: "session" });
const rupees = (paise: number) => ({ paise, currency: "INR" as const });
const logExpense = (kind: LogExpense["kind"], paise: number, extra: Partial<LogExpense> = {}): LogExpense => ({
  type: "LogExpense",
  kind,
  amount: rupees(paise),
  paidOn: "2026-11-19",
  payee: "Gizmo Parts Bazaar",
  ...extra,
});

const expenseIdOf = (result: Awaited<ReturnType<typeof books.execute>>) => {
  if (!result.ok || result.events[0]?.type !== "ExpenseLogged") throw new Error(`expected ExpenseLogged, got ${JSON.stringify(result)}`);
  return result.events[0].expenseId;
};
const expensesOf = async (actor: Actor) =>
  (await db.select({ n: count() }).from(expenses).where(eq(expenses.claimantId, actor.claimantId)))[0]!.n;
const auditRowsOf = (actor: Actor) => db.select().from(auditLog).where(eq(auditLog.actorId, actor.claimantId)).orderBy(auditLog.id);
const settle = <T>(p: Promise<T>, ms = 300) => Promise.race([p.then(() => "done"), new Promise((r) => setTimeout(() => r("waiting"), ms))]);

beforeAll(() => {
  // Migrated once by test/migrate-once.ts (vitest globalSetup).
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
});

afterAll(() => pool.end());

describe("LogExpense", () => {
  it("opens an online Expense of ₹1,299.00 with one expected Bill of ₹1,299.00", async () => {
    const mickey = claimant();
    jobs.length = 0;
    const result = await books.execute(mickey, logExpense("online", 129900, { orderRef: "402-0000000-0000001" }));
    expect(result).toMatchObject({ ok: true, events: [{ type: "ExpenseLogged" }, { type: "BillAdded", fulfilledOn: null }] });
    expect(jobs).toEqual([]);

    const read = await books.expense(mickey, expenseIdOf(result));
    expect(read).toMatchObject({
      ok: true,
      expense: {
        status: "open",
        kind: "online",
        amount: rupees(129900),
        openAmount: rupees(0),
        paidOn: "2026-11-19",
        payee: "Gizmo Parts Bazaar",
        orderRef: "402-0000000-0000001",
        source: "manual",
        bills: [{ kind: null, amount: rupees(129900), fulfilledOn: null, status: "expected" }],
      },
    });
    if (!read.ok) return;
    expect(read.expense.reference).toMatch(/^E-[1-9]\d*$/);
    expect(read.expense.bills[0]!.reference).toMatch(/^B-[1-9]\d*$/);
  });

  it("Shop Expense: ₹250.00 logged → one Fulfilled Bill of ₹250.00", async () => {
    const mickey = claimant();
    const read = await books.expense(mickey, expenseIdOf(await books.execute(mickey, logExpense("shop", 25000))));
    expect(read).toMatchObject({
      ok: true,
      expense: { status: "open", bills: [{ amount: rupees(25000), fulfilledOn: "2026-11-19", status: "expected" }] },
    });
    if (read.ok) expect(read.expense.bills).toHaveLength(1);
  });

  it("writes one audit entry per event, in the same transaction, with who, when and the states", async () => {
    const mickey = claimant();
    const result = await books.execute(mickey, logExpense("online", 50000), { idempotencyKey: `k-${randomUUID()}` });
    const expenseId = expenseIdOf(result);
    const rows = await auditRowsOf(mickey);
    expect(rows).toMatchObject([
      { command: "LogExpense", event: "ExpenseLogged", entity: "expense", entityId: expenseId, fromState: null, toState: "open", at: NOW },
      { command: "LogExpense", event: "BillAdded", entity: "bill", fromState: null, toState: "expected", at: NOW },
    ]);
    if (!result.ok) return;
    expect(rows.map((r) => r.payload)).toEqual(result.events);
    // The audit log keys an idempotency key once (schema), so the first entry carries it.
    expect(rows[0]!.idempotencyKey).toMatch(/^k-/);
    expect(rows[1]!.idempotencyKey).toBeNull();
  });

  it("refuses an invalid command as validation and changes nothing", async () => {
    const mickey = claimant();
    expect(await books.execute(mickey, logExpense("shop", 0))).toEqual({ ok: false, reason: "validation", field: "amount" });
    expect(await expensesOf(mickey)).toBe(0);
    expect(await auditRowsOf(mickey)).toEqual([]);
  });
});

describe("Transactions", () => {
  it("Failed audit write blocks the change: no audit row, no state row", async () => {
    const mickey = claimant();
    const key = `taken-${randomUUID()}`;
    // Another entry already holds this key, so the audit insert fails.
    await db.insert(auditLog).values({ actorId: randomUUID(), command: "x", event: "x", entity: "x", entityId: randomUUID(), idempotencyKey: key });
    await expect(books.execute(mickey, logExpense("online", 100), { idempotencyKey: key })).rejects.toThrow();
    expect(await expensesOf(mickey)).toBe(0);
    expect(await auditRowsOf(mickey)).toEqual([]);
  });

  it("writes the audit row before the state row it describes (design D2)", async () => {
    const mickey = claimant();
    // Scoped to this Claimant, so other test files sharing the database are untouched.
    await pool.query(`create or replace function test_audit_first() returns trigger language plpgsql as $$
      begin
        if new.claimant_id = '${mickey.claimantId}' and not exists (
          select 1 from audit_log where entity = 'expense' and entity_id = new.id
        ) then raise exception 'state row before its audit row'; end if;
        return new;
      end $$`);
    await pool.query("create or replace trigger test_audit_first before insert on expenses for each row execute function test_audit_first()");
    try {
      expect(await books.execute(mickey, logExpense("online", 100))).toMatchObject({ ok: true });
    } finally {
      await pool.query("drop trigger test_audit_first on expenses; drop function test_audit_first()");
    }
    expect(await expensesOf(mickey)).toBe(1);
  });

  it("a failure after the writes rolls back every audit and state row", async () => {
    const mickey = claimant();
    // The idempotency record is the last write; make it fail once the audit and state rows are in.
    await pool.query(`create or replace function test_refuse_boom() returns trigger language plpgsql as $$
      begin if new.key = 'boom' then raise exception 'boom'; end if; return new; end $$`);
    await pool.query("create or replace trigger test_refuse_boom before insert on idempotency_keys for each row execute function test_refuse_boom()");
    try {
      await expect(books.execute(mickey, logExpense("online", 100), { idempotencyKey: "boom" })).rejects.toThrow();
    } finally {
      await pool.query("drop trigger test_refuse_boom on idempotency_keys; drop function test_refuse_boom()");
    }
    expect(await expensesOf(mickey)).toBe(0);
    expect(await auditRowsOf(mickey)).toEqual([]);
  });
});

describe("Idempotency", () => {
  it("returns the original result when a key is replayed, and writes nothing more", async () => {
    const mickey = claimant();
    const key = `k-${randomUUID()}`;
    const first = await books.execute(mickey, logExpense("shop", 25000), { idempotencyKey: key });
    const again = await books.execute(mickey, logExpense("shop", 25000), { idempotencyKey: key });
    expect(again).toEqual(first);
    expect(await expensesOf(mickey)).toBe(1);
    expect(await auditRowsOf(mickey)).toHaveLength(2);
  });

  it("refuses the same key with a different command as idempotency_conflict", async () => {
    const mickey = claimant();
    const key = `k-${randomUUID()}`;
    await books.execute(mickey, logExpense("shop", 25000), { idempotencyKey: key });
    expect(await books.execute(mickey, logExpense("shop", 26000), { idempotencyKey: key })).toEqual({
      ok: false,
      reason: "idempotency_conflict",
    });
    expect(await books.execute(claimant(), logExpense("shop", 25000), { idempotencyKey: key })).toEqual({
      ok: false,
      reason: "idempotency_conflict",
    });
    expect(await expensesOf(mickey)).toBe(1);
  });
});

describe("Idempotency races", () => {
  it("one Claimant sending one key twice at once gets one Expense and the same result twice", async () => {
    const mickey = claimant();
    const key = `k-${randomUUID()}`;
    const [a, b] = await Promise.all([0, 1].map(() => books.execute(mickey, logExpense("shop", 25000), { idempotencyKey: key })));
    expect(a).toEqual(b);
    expect(a).toMatchObject({ ok: true });
    expect(await expensesOf(mickey)).toBe(1);
  });

  it("two Claimants sending one new key at once: one is served, the other is refused as idempotency_conflict", async () => {
    const mickey = claimant();
    const dexter = claimant();
    const key = `k-${randomUUID()}`;
    // Hold the winner's transaction open after its writes, so the loser has read no key and its insert must wait, then fail.
    await pool.query(`create or replace function test_hold_key() returns trigger language plpgsql as $$
      begin if new.key = '${key}' then perform pg_sleep(0.3); end if; return new; end $$`);
    await pool.query("create or replace trigger test_hold_key after insert on idempotency_keys for each row execute function test_hold_key()");
    try {
      const results = await Promise.all([
        books.execute(mickey, logExpense("shop", 25000), { idempotencyKey: key }),
        books.execute(dexter, logExpense("shop", 25000), { idempotencyKey: key }),
      ]);
      const reasons = results.map((r) => (r.ok ? "ok" : r.reason)).sort();
      expect(reasons).toEqual(["idempotency_conflict", "ok"]);
    } finally {
      await pool.query("drop trigger test_hold_key on idempotency_keys; drop function test_hold_key()");
    }
    expect((await expensesOf(mickey)) + (await expensesOf(dexter))).toBe(1);
  });
});

describe("Authorization", () => {
  it("reads another Claimant's Expense as not_found, the same as one that does not exist", async () => {
    const mickey = claimant();
    const dexter = claimant();
    const id = expenseIdOf(await books.execute(mickey, logExpense("online", 100)));
    expect(await books.expense(dexter, id)).toEqual({ ok: false, reason: "not_found" });
    expect(await books.expense(dexter, randomUUID())).toEqual({ ok: false, reason: "not_found" });
    expect(await books.expense(mickey, "not-a-uuid")).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("Concurrency (design D5)", () => {
  it("serialises a Claimant's writes and never blocks another Claimant", async () => {
    const mickey = claimant();
    const dexter = claimant();
    // Another writer holds Mickey's lock mid-command.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const isLocked = new Promise<void>((r) => (locked = r));
    const writer = db.transaction(async (tx) => {
      await lockClaimant(tx, mickey.claimantId);
      locked();
      await held;
    });
    await isLocked;

    const mickeys = books.execute(mickey, logExpense("online", 100));
    expect(await settle(books.execute(dexter, logExpense("online", 100)))).toBe("done");
    expect(await settle(mickeys)).toBe("waiting");

    release();
    await writer;
    expect(await settle(mickeys, 5000)).toBe("done");
    expect(await expensesOf(mickey)).toBe(1);
  });

  it("loses no write when one Claimant logs ten Expenses at once", async () => {
    const mickey = claimant();
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => books.execute(mickey, logExpense("shop", 100 + i))));
    expect(results.every((r) => r.ok)).toBe(true);
    const reads = await Promise.all(results.map((r) => books.expense(mickey, expenseIdOf(r))));
    const amounts = reads.map((r) => (r.ok ? r.expense.amount?.paise : null)).sort();
    expect(amounts).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
    expect(new Set(reads.map((r) => r.ok && r.expense.reference)).size).toBe(10);
    expect(await auditRowsOf(mickey)).toHaveLength(20);
    expect(
      (await db.select({ n: count() }).from(auditLog).where(and(eq(auditLog.actorId, mickey.claimantId), eq(auditLog.entity, "expense"))))[0]!.n,
    ).toBe(10);
  });
});

describe("Derivation on read", () => {
  it("feeds Refunds from the refunds table: expected, then received", async () => {
    const mickey = claimant();
    const id = expenseIdOf(await books.execute(mickey, logExpense("shop", 100000)));
    // A Refund beside a live Bill, which no command makes: the row goes in directly, to test the read alone.
    const [refund] = await db.insert(refunds).values({ expenseId: id, amountPaise: 30000, reason: "cancelled" }).returning();

    expect(await books.expense(mickey, id)).toMatchObject({
      ok: true,
      expense: { status: "open", openAmount: rupees(-30000), reason: { code: "refund_owed" }, bills: [{ status: "expected" }] },
    });

    await db.update(refunds).set({ refundedOn: "2026-11-21" }).where(eq(refunds.id, refund!.id));
    expect(await books.expense(mickey, id)).toMatchObject({ ok: true, expense: { reason: { code: "bill_missing" } } });
  });
});

const ok = (result: Result): Extract<Result, { ok: true }> => {
  if (!result.ok) throw new Error(`expected Ok, got ${JSON.stringify(result)}`);
  return result;
};
// An online Order of the given Payment: its Expense id and expected Bill id.
const order = async (actor: Actor, paise: number) => {
  const result = ok(await books.execute(actor, logExpense("online", paise)));
  const [logged, added] = result.events;
  if (logged?.type !== "ExpenseLogged" || added?.type !== "BillAdded") throw new Error("expected an Order");
  return { expenseId: logged.expenseId, expectedBillId: added.billId };
};
const read = async (actor: Actor, id: string) => {
  const result = await books.expense(actor, id);
  if (!result.ok) throw new Error("expected the Expense");
  return result.expense;
};

// Order flow through execute (expense-tracking: Order splitting, cancellation and Refunds, Return before submission).
describe("Order flow", () => {
  const billsOf = async (actor: Actor, id: string) => (await read(actor, id)).bills.map((b) => [b.amount?.paise, b.status]);

  it("First delivery: an Invoice of ₹1,200.00 on a ₹3,000.00 Order → a Fulfilled Bill of ₹1,200.00, expected Bill ₹1,800.00", async () => {
    const mickey = claimant();
    const { expenseId, expectedBillId } = await order(mickey, 300000);
    expect(await billsOf(mickey, expenseId)).toEqual([[300000, "expected"]]);

    ok(await books.execute(mickey, { type: "SplitExpectedBill", billId: expectedBillId, amount: rupees(120000), fulfilledOn: "2026-11-21" }));

    const expense = await read(mickey, expenseId);
    expect(expense.bills).toMatchObject([
      { id: expectedBillId, amount: rupees(180000), fulfilledOn: null, status: "expected" },
      { amount: rupees(120000), fulfilledOn: "2026-11-21", status: "expected", kind: null },
    ]);
    expect(expense).toMatchObject({ status: "open", openAmount: rupees(0), reason: { code: "awaiting_goods" } });
    expect((await auditRowsOf(mickey)).slice(2)).toMatchObject([
      { command: "SplitExpectedBill", event: "ExpectedBillReduced", entity: "bill", entityId: expectedBillId, fromState: "expected", toState: "expected" },
      { command: "SplitExpectedBill", event: "BillAdded", entity: "bill", fromState: null, toState: "expected" },
    ]);
  });

  it("another Claimant's Bill is not_found and nothing changes", async () => {
    const mickey = claimant();
    const { expenseId, expectedBillId } = await order(mickey, 300000);
    const split = { type: "SplitExpectedBill", billId: expectedBillId, amount: rupees(100), fulfilledOn: "2026-11-21" } as const;
    expect(await books.execute(claimant(), split)).toEqual({ ok: false, reason: "not_found" });
    expect(await books.execute(mickey, { ...split, billId: randomUUID() })).toEqual({ ok: false, reason: "not_found" });
    expect(await billsOf(mickey, expenseId)).toEqual([[300000, "expected"]]);
    expect(await auditRowsOf(mickey)).toHaveLength(2);
  });

  // ₹3,000.00 Order after the first delivery: expected remainder ₹1,800.00, Fulfilled ₹1,200.00.
  const delivered = async (actor: Actor) => {
    const placed = await order(actor, 300000);
    const split = ok(
      await books.execute(actor, { type: "SplitExpectedBill", billId: placed.expectedBillId, amount: rupees(120000), fulfilledOn: "2026-11-21" }),
    );
    const added = split.events[1];
    if (added?.type !== "BillAdded") throw new Error("expected BillAdded");
    return { ...placed, deliveredBillId: added.billId };
  };
  const refundsOf = async (actor: Actor, id: string) => (await read(actor, id)).refunds.map((r) => [r.amount.paise, r.reason, r.status]);

  it("Partial cancellation, then Cancel everything left: ₹500.00 of ₹1,800.00, then the ₹1,300.00 remainder", async () => {
    const mickey = claimant();
    const { expenseId, expectedBillId } = await delivered(mickey);

    ok(await books.execute(mickey, { type: "ExpectRefund", billId: expectedBillId, amount: rupees(50000) }));
    expect(await billsOf(mickey, expenseId)).toEqual([
      [130000, "expected"],
      [120000, "expected"],
    ]);
    expect(await refundsOf(mickey, expenseId)).toEqual([[50000, "cancelled", "expected"]]);

    ok(await books.execute(mickey, { type: "CancelBill", billId: expectedBillId }));
    expect(await billsOf(mickey, expenseId)).toEqual([
      [130000, "cancelled"],
      [120000, "expected"],
    ]);
    expect(await refundsOf(mickey, expenseId)).toEqual([
      [50000, "cancelled", "expected"],
      [130000, "cancelled", "expected"],
    ]);
    const expense = await read(mickey, expenseId);
    expect(expense).toMatchObject({ status: "open", openAmount: rupees(0), reason: { code: "refund_owed" } });
    expect(expense.refunds[0]!.reference).toMatch(/^R-[1-9]\d*$/);

    expect((await auditRowsOf(mickey)).slice(4).map((r) => [r.command, r.event, r.entity, r.fromState, r.toState])).toEqual([
      ["ExpectRefund", "ExpectedBillReduced", "bill", "expected", "expected"],
      ["ExpectRefund", "RefundExpected", "refund", null, "expected"],
      ["CancelBill", "BillCancelled", "bill", "expected", "cancelled"],
      ["CancelBill", "RefundExpected", "refund", null, "expected"],
    ]);
  });

  it("Cancelled before fulfilment: an expected Bill of ₹800.00 → cancelled, and an expected Refund of ₹800.00", async () => {
    const mickey = claimant();
    const { expenseId, expectedBillId } = await order(mickey, 80000);
    ok(await books.execute(mickey, { type: "CancelBill", billId: expectedBillId }));
    expect(await billsOf(mickey, expenseId)).toEqual([[80000, "cancelled"]]);
    expect(await refundsOf(mickey, expenseId)).toEqual([[80000, "cancelled", "expected"]]);
  });

  it("refuses cancelling more than the remainder, or a cancelled Bill, and changes nothing", async () => {
    const mickey = claimant();
    const { expenseId, expectedBillId } = await delivered(mickey);
    expect(await books.execute(mickey, { type: "ExpectRefund", billId: expectedBillId, amount: rupees(180001) })).toEqual({
      ok: false,
      reason: "validation",
      field: "amount",
    });
    ok(await books.execute(mickey, { type: "CancelBill", billId: expectedBillId }));
    const before = await auditRowsOf(mickey);
    expect(await books.execute(mickey, { type: "CancelBill", billId: expectedBillId })).toEqual({ ok: false, reason: "invalid_transition" });
    expect(await refundsOf(mickey, expenseId)).toEqual([[180000, "cancelled", "expected"]]);
    expect(await auditRowsOf(mickey)).toEqual(before);
  });

  it("Return of a ready Bill: ₹600.00 → cancelled for good, and an expected Refund of ₹600.00", async () => {
    const mickey = claimant();
    const expenseId = expenseIdOf(await books.execute(mickey, logExpense("shop", 60000)));
    // No command attaches a document yet (LogDocument, Phase 2): the link goes in directly.
    await db.update(bills).set({ paperlessId: 7 }).where(eq(bills.expenseId, expenseId));
    const [billId] = (await read(mickey, expenseId)).bills.map((b) => b.id);
    expect(await billsOf(mickey, expenseId)).toEqual([[60000, "ready"]]);

    ok(await books.execute(mickey, { type: "ReturnBill", billId: billId! }));
    expect(await billsOf(mickey, expenseId)).toEqual([[60000, "cancelled"]]);
    expect(await refundsOf(mickey, expenseId)).toEqual([[60000, "returned", "expected"]]);
    expect(await read(mickey, expenseId)).toMatchObject({ status: "open", openAmount: rupees(0), reason: { code: "refund_owed" } });

    // Cancelled Bill stays cancelled: it can be neither returned nor cancelled again.
    expect(await books.execute(mickey, { type: "ReturnBill", billId: billId! })).toEqual({ ok: false, reason: "invalid_transition" });
    expect(await books.execute(mickey, { type: "CancelBill", billId: billId! })).toEqual({ ok: false, reason: "invalid_transition" });
    expect(await billsOf(mickey, expenseId)).toEqual([[60000, "cancelled"]]);
    expect(await refundsOf(mickey, expenseId)).toHaveLength(1);
  });

  it("Refund received, then settling: a ₹3,000.00 Order with ₹1,200.00 returned and ₹1,800.00 cancelled settles once both Refunds are in", async () => {
    const mickey = claimant();
    const { expenseId, expectedBillId, deliveredBillId } = await delivered(mickey);
    ok(await books.execute(mickey, { type: "ReturnBill", billId: deliveredBillId }));
    ok(await books.execute(mickey, { type: "CancelBill", billId: expectedBillId }));
    const [returned, cancelled] = (await read(mickey, expenseId)).refunds;

    // Expected Refund blocks settled.
    expect(await read(mickey, expenseId)).toMatchObject({ status: "open", openAmount: rupees(0), reason: { code: "refund_owed" } });

    ok(await books.execute(mickey, { type: "MarkRefundReceived", refundId: returned!.id, refundedOn: "2026-11-24" }));
    expect((await read(mickey, expenseId)).refunds).toMatchObject([
      { amount: rupees(120000), reason: "returned", status: "received", refundedOn: "2026-11-24" },
      { amount: rupees(180000), reason: "cancelled", status: "expected", refundedOn: null },
    ]);
    expect(await read(mickey, expenseId)).toMatchObject({ status: "open", reason: { code: "refund_owed" } });

    ok(await books.execute(mickey, { type: "MarkRefundReceived", refundId: cancelled!.id, refundedOn: "2026-11-26" }));
    expect(await read(mickey, expenseId)).toMatchObject({ status: "settled", openAmount: rupees(0), reason: null });

    const last = (await auditRowsOf(mickey)).at(-1)!;
    expect([last.command, last.event, last.entity, last.entityId, last.fromState, last.toState]).toEqual([
      "MarkRefundReceived",
      "RefundReceived",
      "refund",
      cancelled!.id,
      "expected",
      "received",
    ]);
  });

  it("stores why each Bill was cancelled and which Bill each Refund came from: a return is told apart from a cancel", async () => {
    const mickey = claimant();
    const { expenseId, expectedBillId, deliveredBillId } = await delivered(mickey);
    ok(await books.execute(mickey, { type: "ExpectRefund", billId: expectedBillId, amount: rupees(50000) }));
    ok(await books.execute(mickey, { type: "ReturnBill", billId: deliveredBillId }));
    ok(await books.execute(mickey, { type: "CancelBill", billId: expectedBillId }));

    const expense = await read(mickey, expenseId);
    expect(expense.bills.map((b) => [b.id, b.cancelReason])).toEqual([
      [expectedBillId, "cancelled"],
      [deliveredBillId, "returned"],
    ]);
    expect(expense.refunds.map((r) => [r.amount.paise, r.reason, r.billId])).toEqual([
      [50000, "cancelled", expectedBillId],
      [120000, "returned", deliveredBillId],
      [130000, "cancelled", expectedBillId],
    ]);
  });

  it("refuses receiving a Refund twice, or another Claimant's, and keeps the first date", async () => {
    const mickey = claimant();
    const { expenseId, expectedBillId } = await order(mickey, 80000);
    ok(await books.execute(mickey, { type: "CancelBill", billId: expectedBillId }));
    const [refund] = (await read(mickey, expenseId)).refunds;
    const mark = { type: "MarkRefundReceived", refundId: refund!.id, refundedOn: "2026-11-24" } as const;
    expect(await books.execute(claimant(), mark)).toEqual({ ok: false, reason: "not_found" });
    ok(await books.execute(mickey, mark));
    expect(await books.execute(mickey, { ...mark, refundedOn: "2026-11-25" })).toEqual({ ok: false, reason: "invalid_transition" });
    expect((await read(mickey, expenseId)).refunds).toMatchObject([{ refundedOn: "2026-11-24", status: "received" }]);
  });
});

// Expense corrections and their lock (expense-tracking), through execute. A submitted Claim is pinned on the pure core
// until Claims exist: no command puts a Bill on one yet.
describe("Expense corrections", () => {
  it("Edit before submission: ₹1,000.00 corrected to ₹1,100.00 → the amount changes and an audit entry holds from and to", async () => {
    const mickey = claimant();
    const expenseId = expenseIdOf(await books.execute(mickey, logExpense("shop", 100000)));

    ok(await books.execute(mickey, { type: "CorrectExpense", expenseId, amount: rupees(110000), payee: "Courage Hardware", paidOn: "2026-11-18" }));

    expect(await read(mickey, expenseId)).toMatchObject({
      amount: rupees(110000),
      payee: "Courage Hardware",
      paidOn: "2026-11-18",
      openAmount: rupees(10000),
      bills: [{ amount: rupees(100000) }],
    });
    const last = (await auditRowsOf(mickey)).at(-1)!;
    expect(last).toMatchObject({ command: "CorrectExpense", event: "ExpenseCorrected", entity: "expense", entityId: expenseId, fromState: "open", toState: "open" });
    expect(last.payload).toEqual({
      type: "ExpenseCorrected",
      expenseId,
      changes: {
        amount: { from: rupees(100000), to: rupees(110000) },
        payee: { from: "Gizmo Parts Bazaar", to: "Courage Hardware" },
        paidOn: { from: "2026-11-19", to: "2026-11-18" },
      },
    });
  });

  it("keeping every value writes no audit entry; another Claimant's Expense is not_found", async () => {
    const mickey = claimant();
    const expenseId = expenseIdOf(await books.execute(mickey, logExpense("shop", 100000)));
    expect(await books.execute(mickey, { type: "CorrectExpense", expenseId, amount: rupees(100000) })).toEqual({ ok: true, events: [] });
    expect(await books.execute(claimant(), { type: "CorrectExpense", expenseId, amount: rupees(1) })).toEqual({ ok: false, reason: "not_found" });
    expect(await auditRowsOf(mickey)).toHaveLength(2);
    expect(await read(mickey, expenseId)).toMatchObject({ amount: rupees(100000) });
  });
});

// Bill corrections after a document is attached (expense-tracking), through execute.
describe("Bill corrections", () => {
  it("Reader got the amount wrong: ₹1,180.00 → ₹1,108.00 shows differs from the document until confirmed, each step audited", async () => {
    const mickey = claimant();
    const expenseId = expenseIdOf(await books.execute(mickey, logExpense("shop", 118000)));
    // No command attaches a document yet (LogDocument, Phase 2): the link and kind go in directly.
    await db.update(bills).set({ paperlessId: 7, kind: "invoice" }).where(eq(bills.expenseId, expenseId));
    const billId = (await read(mickey, expenseId)).bills[0]!.id;

    ok(await books.execute(mickey, { type: "CorrectBill", billId, amount: rupees(110800), billNo: "GPB/2611/042", billDate: "2026-11-18" }));
    expect((await read(mickey, expenseId)).bills).toMatchObject([
      { amount: rupees(110800), billNo: "GPB/2611/042", billDate: "2026-11-18", differs: true, status: "ready" },
    ]);
    const corrected = (await auditRowsOf(mickey)).at(-1)!;
    expect(corrected).toMatchObject({ command: "CorrectBill", event: "BillCorrected", entity: "bill", entityId: billId, fromState: "ready", toState: "ready" });
    expect(corrected.payload).toMatchObject({ changes: { amount: { from: rupees(118000), to: rupees(110800) } }, differs: true });

    ok(await books.execute(mickey, { type: "ConfirmDiffers", billId }));
    expect((await read(mickey, expenseId)).bills).toMatchObject([{ amount: rupees(110800), differs: false }]);
    expect((await auditRowsOf(mickey)).at(-1)).toMatchObject({ command: "ConfirmDiffers", event: "DiffersConfirmed", entityId: billId });
  });

  it("refuses a Bill without its document and changes nothing", async () => {
    const mickey = claimant();
    const expenseId = expenseIdOf(await books.execute(mickey, logExpense("shop", 118000)));
    const billId = (await read(mickey, expenseId)).bills[0]!.id;
    expect(await books.execute(mickey, { type: "CorrectBill", billId, amount: rupees(110800) })).toEqual({ ok: false, reason: "invalid_transition" });
    expect((await read(mickey, expenseId)).bills).toMatchObject([{ amount: rupees(118000), differs: false }]);
    expect(await auditRowsOf(mickey)).toHaveLength(2);
  });
});

// Closing an Expense (expense-tracking; FUNCTIONAL §3.1), through execute. A submitted Claim is pinned on the pure core.
describe("Closing an Expense", () => {
  // ₹3,000.00 Order: ₹1,200.00 delivered, then ₹500.00 of the ₹1,800.00 remainder cancelled (an expected Refund).
  const withRefund = async (actor: Actor) => {
    const { expenseId, expectedBillId } = await order(actor, 300000);
    ok(await books.execute(actor, { type: "SplitExpectedBill", billId: expectedBillId, amount: rupees(120000), fulfilledOn: "2026-11-21" }));
    ok(await books.execute(actor, { type: "ExpectRefund", billId: expectedBillId, amount: rupees(50000) }));
    const expense = await read(actor, expenseId);
    return { expenseId, refundId: expense.refunds[0]!.id };
  };
  const retag = (expenseId: string, add: string[]) => ({
    name: "paperless.setTags",
    data: { expenseId, remove: ["reimb:ready", "reimb:claimed", "reimb:reimbursed"], add },
  });

  it("Close as personal: unclaimed Bills cancelled, the ₹500.00 Refund written off, closed, and the retag job enqueued", async () => {
    const mickey = claimant();
    const { expenseId, refundId } = await withRefund(mickey);
    jobs.length = 0;

    ok(await books.execute(mickey, { type: "CloseExpense", expenseId, reason: "personal", refunds: { [refundId]: "written_off" } }));

    const expense = await read(mickey, expenseId);
    expect(expense).toMatchObject({ status: "closed", closedReason: "personal", reason: null });
    expect(expense.bills.map((b) => [b.amount?.paise, b.status, b.cancelReason])).toEqual([
      [130000, "cancelled", "cancelled"],
      [120000, "cancelled", "cancelled"],
    ]);
    expect(expense.refunds).toMatchObject([{ amount: rupees(50000), status: "written_off", refundedOn: null }]);
    // ₹3,000.00 − no live Bills − no Refunds left in Σ Refunds − ₹500.00 written off.
    expect(expense.openAmount).toEqual(rupees(250000));
    expect(jobs).toEqual([retag(expenseId, ["personal"])]);
    expect((await auditRowsOf(mickey)).slice(-4).map((r) => [r.event, r.entity, r.fromState, r.toState])).toEqual([
      ["BillCancelled", "bill", "expected", "cancelled"],
      ["BillCancelled", "bill", "expected", "cancelled"],
      ["RefundWrittenOff", "refund", "expected", "written_off"],
      ["ExpenseClosed", "expense", "open", "closed"],
    ]);
  });

  it("sums every written-off amount: ₹500.00 and ₹300.00 written off on closing count ₹800.00", async () => {
    const mickey = claimant();
    const { expenseId, expectedBillId } = await order(mickey, 300000);
    ok(await books.execute(mickey, { type: "ExpectRefund", billId: expectedBillId, amount: rupees(50000) }));
    ok(await books.execute(mickey, { type: "ExpectRefund", billId: expectedBillId, amount: rupees(30000) }));
    const [first, second] = (await read(mickey, expenseId)).refunds;

    const refunds = { [first!.id]: "written_off", [second!.id]: "written_off" } as const;
    ok(await books.execute(mickey, { type: "CloseExpense", expenseId, reason: "written_off", refunds }));

    // ₹3,000.00 − ₹800.00 written off; the ₹2,200.00 remainder Bill is cancelled.
    expect(await read(mickey, expenseId)).toMatchObject({ status: "closed", closedReason: "written_off", openAmount: rupees(220000) });
  });

  it("Duplicate keeps the Refund expected, adds no tag, and the Refund is still received later", async () => {
    const mickey = claimant();
    const { expenseId, refundId } = await withRefund(mickey);
    jobs.length = 0;
    ok(await books.execute(mickey, { type: "CloseExpense", expenseId, reason: "duplicate", refunds: { [refundId]: "expected" } }));
    expect(jobs).toEqual([retag(expenseId, [])]);
    ok(await books.execute(mickey, { type: "MarkRefundReceived", refundId, refundedOn: "2026-11-26" }));
    expect(await read(mickey, expenseId)).toMatchObject({ status: "closed", openAmount: rupees(250000), refunds: [{ status: "received" }] });
  });

  it("refuses closing without an answer for each expected Refund: nothing changes and no job is enqueued", async () => {
    const mickey = claimant();
    const { expenseId } = await withRefund(mickey);
    const before = await auditRowsOf(mickey);
    jobs.length = 0;
    expect(await books.execute(mickey, { type: "CloseExpense", expenseId, reason: "personal", refunds: {} })).toEqual({
      ok: false,
      reason: "validation",
      field: "refunds",
    });
    expect(jobs).toEqual([]);
    expect(await auditRowsOf(mickey)).toEqual(before);
    expect(await read(mickey, expenseId)).toMatchObject({ status: "open", closedReason: null });
  });
});
