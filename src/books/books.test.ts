import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/src/db/index";
import { auditLog, expenses } from "@/src/db/schema";
import { createBooks, lockClaimant } from "./books";
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
  payee: "Robu",
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

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
  await migrate(db, { migrationsFolder: "./drizzle" });
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
        payee: "Robu",
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
