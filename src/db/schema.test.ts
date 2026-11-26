import { randomUUID } from "node:crypto";
import { eq, TransactionRollbackError } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "./index";
import { auditLog, bills, expenseReferenceSeq, expenses, owedToUniversity, refunds } from "./schema";

// Needs a real Postgres: DATABASE_URL (CI service container, or a scratch postgres:19.0).
// Keys and References, platform-foundations spec and ADR 0005.

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const mickey = randomUUID();
const dexter = randomUUID();

const logExpense = async (claimantId: string) =>
  (await db.insert(expenses).values({ claimantId, amountPaise: 25050 }).returning())[0]!;

const auditEntry = (entityId: string, idempotencyKey?: string) => ({
  actorId: mickey,
  command: "LogExpense",
  event: "ExpenseLogged",
  entity: "expense",
  entityId,
  toState: "open",
  idempotencyKey,
});

// Drizzle wraps the Postgres error; its SQLSTATE is on the cause.
const refusedWith = (code: string, query: Promise<unknown>) => expect(query).rejects.toMatchObject({ cause: { code } });
const CHECK_VIOLATION = "23514";
const GENERATED_ALWAYS = "428C9";
const refusedAsImmutable = (query: Promise<unknown>) => refusedWith(CHECK_VIOLATION, query);

beforeAll(() => {
  // Migrated once by test/migrate-once.ts (vitest globalSetup).
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
});

afterAll(() => pool.end());

describe("Keys and References", () => {
  it("gives two Claimants' Expenses different, consecutive References", async () => {
    const first = await logExpense(mickey);
    const second = await logExpense(dexter);
    const n = Number(first.reference.slice(2));
    expect(first.reference).toMatch(/^E-[1-9]\d*$/);
    expect(second.reference).toBe(`E-${n + 1}`);
  });

  it("keys every record with a UUIDv7", async () => {
    const expense = await logExpense(mickey);
    const [bill] = await db.insert(bills).values({ expenseId: expense.id, kind: "invoice", amountPaise: 600 }).returning();
    const [refund] = await db.insert(refunds).values({ expenseId: expense.id, amountPaise: 600, reason: "returned" }).returning();
    const [owed] = await db.insert(owedToUniversity).values({ claimantId: mickey, billId: bill!.id, amountPaise: 600 }).returning();
    const [entry] = await db.insert(auditLog).values(auditEntry(expense.id)).returning();
    for (const record of [expense, bill!, refund!, owed!, entry!]) expect(record.id).toMatch(UUID_V7);
    const [found] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(found?.reference).toBe(expense.reference);
  });

  it("orders UUIDv7 keys by creation", async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await logExpense(mickey)).id);
    expect([...ids].sort()).toEqual(ids);
  });

  it("issues E-10000 with no padding", async () => {
    // Jump the sequence, insert inside a rolled-back transaction, then put the sequence back
    // exactly (is_called too), so reruns on the same database neither collide nor skip.
    const seq = expenseReferenceSeq.seqName!;
    const { rows } = await pool.query(`select last_value, is_called from ${seq}`);
    let reference = "";
    try {
      await pool.query("select setval($1, 9999)", [seq]);
      await db
        .transaction(async (tx) => {
          reference = (await tx.insert(expenses).values({ claimantId: mickey, amountPaise: 100 }).returning())[0]!.reference;
          tx.rollback();
        })
        .catch((e) => {
          if (!(e instanceof TransactionRollbackError)) throw e;
        });
    } finally {
      await pool.query("select setval($1, $2, $3)", [seq, rows[0].last_value, rows[0].is_called]);
    }
    expect(reference).toBe("E-10000");
  });

  it("refuses to change a Reference once issued", async () => {
    const expense = await logExpense(mickey);
    await refusedAsImmutable(db.update(expenses).set({ reference: "E-999999999" }).where(eq(expenses.id, expense.id)));
    const [found] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(found?.reference).toBe(expense.reference);
  });

  it("refuses a Reference supplied on insert; only the database issues them", async () => {
    // A supplied E-500 would collide later with the one the sequence issues.
    await refusedWith(GENERATED_ALWAYS, db.insert(expenses).values({ claimantId: mickey, amountPaise: 100, reference: "E-500" }));
    const expense = await logExpense(mickey);
    await refusedWith(
      GENERATED_ALWAYS,
      db.insert(bills).values({ expenseId: expense.id, kind: "invoice", reference: "B-500" }),
    );
  });

  it("accepts an update that sets a Reference to its own value", async () => {
    const expense = await logExpense(mickey);
    const [found] = await db
      .update(expenses)
      .set({ reference: expense.reference, notes: "same Reference" })
      .where(eq(expenses.id, expense.id))
      .returning();
    expect(found).toMatchObject({ reference: expense.reference, notes: "same Reference" });
  });

  it("never stores a padded Reference like E-0042", async () => {
    await refusedWith(GENERATED_ALWAYS, db.insert(expenses).values({ claimantId: mickey, reference: "E-0042" }));
    const expense = await logExpense(mickey);
    await refusedAsImmutable(db.update(expenses).set({ reference: "E-0042" }).where(eq(expenses.id, expense.id)));
    expect(await db.select().from(expenses).where(eq(expenses.reference, "E-0042"))).toEqual([]);
  });

  it("keeps the vendor's Bill number apart from the Reference through a correction", async () => {
    const expense = await logExpense(mickey);
    const [bill] = await db
      .insert(bills)
      .values({ expenseId: expense.id, kind: "invoice", billNo: "128", amountPaise: 25050 })
      .returning();
    expect(bill!.reference).toMatch(/^B-[1-9]\d*$/);

    await db.update(bills).set({ billNo: "1280" }).where(eq(bills.id, bill!.id));
    const [found] = await db.select().from(bills).where(eq(bills.id, bill!.id));
    expect(found).toMatchObject({ reference: bill!.reference, billNo: "1280" });
  });

  it("gives Refunds and Owed to university their own letters, unchangeable too", async () => {
    const expense = await logExpense(dexter);
    const [bill] = await db.insert(bills).values({ expenseId: expense.id, kind: "invoice", amountPaise: 600 }).returning();
    const [refund] = await db
      .insert(refunds)
      .values({ expenseId: expense.id, amountPaise: 600, reason: "returned" })
      .returning();
    const [owed] = await db
      .insert(owedToUniversity)
      .values({ claimantId: dexter, billId: bill!.id, amountPaise: 600 })
      .returning();
    expect(refund!.reference).toMatch(/^R-[1-9]\d*$/);
    expect(owed!.reference).toMatch(/^O-[1-9]\d*$/);

    await refusedAsImmutable(db.update(bills).set({ reference: "B-999999999" }).where(eq(bills.id, bill!.id)));
    await refusedAsImmutable(db.update(refunds).set({ reference: "R-999999999" }).where(eq(refunds.id, refund!.id)));
    await refusedAsImmutable(db.update(owedToUniversity).set({ reference: "O-999999999" }).where(eq(owedToUniversity.id, owed!.id)));
  });
});

describe("Amounts", () => {
  const NOT_NULL_VIOLATION = "23502";

  it("lets an Expense and its Payment proof Bill wait with the amount blank", async () => {
    // document-intake: a payment confirmation whose amount can't be read still makes the Expense.
    const [expense] = await db.insert(expenses).values({ claimantId: mickey }).returning();
    const [bill] = await db.insert(bills).values({ expenseId: expense!.id, kind: "payment_proof" }).returning();
    expect(expense!.amountPaise).toBeNull();
    expect(bill!.amountPaise).toBeNull();
  });

  it("refuses a Refund or Owed to university without an amount", async () => {
    const expense = await logExpense(dexter);
    const [bill] = await db.insert(bills).values({ expenseId: expense.id, kind: "invoice", amountPaise: 600 }).returning();
    // @ts-expect-error amountPaise is required here
    await refusedWith(NOT_NULL_VIOLATION, db.insert(refunds).values({ expenseId: expense.id, reason: "returned" }));
    // @ts-expect-error amountPaise is required here
    await refusedWith(NOT_NULL_VIOLATION, db.insert(owedToUniversity).values({ claimantId: dexter, billId: bill!.id }));
  });
});

describe("Audit log", () => {
  const UNIQUE_VIOLATION = "23505";
  const APPEND_ONLY = "23001"; // restrict_violation

  it("records who, what, when and the states", async () => {
    const expense = await logExpense(mickey);
    const before = Date.now();
    const [entry] = await db
      .insert(auditLog)
      .values({ ...auditEntry(expense.id), payload: { amountPaise: 25050 } })
      .returning();
    expect(entry).toMatchObject({
      actorId: mickey,
      command: "LogExpense",
      event: "ExpenseLogged",
      entity: "expense",
      entityId: expense.id,
      fromState: null,
      toState: "open",
      payload: { amountPaise: 25050 },
      idempotencyKey: null,
    });
    expect(entry!.at.getTime()).toBeGreaterThanOrEqual(before - 5000);
  });

  it("refuses a repeated idempotency key, but any number of entries without one", async () => {
    const expense = await logExpense(mickey);
    const key = randomUUID();
    await db.insert(auditLog).values([auditEntry(expense.id), auditEntry(expense.id), auditEntry(expense.id, key)]);
    await refusedWith(UNIQUE_VIOLATION, db.insert(auditLog).values(auditEntry(expense.id, key)));
  });

  it("is never edited or deleted", async () => {
    const expense = await logExpense(mickey);
    const [entry] = await db.insert(auditLog).values(auditEntry(expense.id)).returning();
    await refusedWith(APPEND_ONLY, db.update(auditLog).set({ toState: "closed" }).where(eq(auditLog.id, entry!.id)));
    await refusedWith(APPEND_ONLY, db.delete(auditLog).where(eq(auditLog.id, entry!.id)));
    const [found] = await db.select().from(auditLog).where(eq(auditLog.id, entry!.id));
    expect(found?.toState).toBe("open");
  });
});
