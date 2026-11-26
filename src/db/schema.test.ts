import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "./index";
import { expenses } from "./schema";

// Needs a real Postgres: DATABASE_URL (CI service container, or a scratch postgres:19.0).
// Keys and References, platform-foundations spec and ADR 0005.

const mickey = randomUUID();
const dexter = randomUUID();

const logExpense = async (claimantId: string) =>
  (await db.insert(expenses).values({ claimantId, amountPaise: 25050 }).returning())[0]!;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
  await migrate(db, { migrationsFolder: "./drizzle" });
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
    expect(expense.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const [found] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
    expect(found?.reference).toBe(expense.reference);
  });
});
