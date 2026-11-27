import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/src/db/index";
import { auditLog } from "@/src/db/schema";
import { createBooks, type Result } from "./books";
import type { Actor } from "./core";

// Payment methods through Books' Interface against a real Postgres (DATABASE_URL): identity-access "Claimant-defined
// Payment methods" (data and commands only; matching a confirmation by its hints is Intake's, Phase 2), and
// expense-tracking "Expense corrections and their lock" for the Payment method. Fresh Claimants in every test.

const NOW = new Date("2026-11-27T10:00:00.000Z");
const books = createBooks({ db, now: () => NOW, enqueue: async () => {} });
const claimant = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant"], via: "session" });
const admin = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant", "admin"], via: "session" });
const NO_HINTS = { bank: null, cardLast4: null, upiHandle: null };

const ok = (result: Result) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result;
};
const method = async (actor: Actor, label = "Travel card", hints: { bank?: string; cardLast4?: string; upiHandle?: string } = {}) => {
  const event = ok(await books.execute(actor, { type: "CreatePaymentMethod", label, hints })).events[0];
  if (event?.type !== "PaymentMethodCreated") throw new Error("expected PaymentMethodCreated");
  return event.paymentMethodId;
};
const methodsOf = async (actor: Actor) => {
  const read = await books.paymentMethods(actor);
  if (!read.ok) throw new Error(`expected paymentMethods, got ${JSON.stringify(read)}`);
  return read.paymentMethods;
};
const auditOf = (id: string) => db.select().from(auditLog).where(eq(auditLog.entityId, id)).orderBy(auditLog.id);

beforeAll(() => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
});
afterAll(() => pool.end());

describe("Claimant-defined Payment methods", () => {
  it("none is hard-coded: a new Claimant has no Payment method", async () => {
    expect(await methodsOf(claimant())).toEqual([]);
  });

  it("Method with hints: \"Travel card\" with the hint card ending 1234 is the Claimant's, active, audited", async () => {
    const mickey = claimant();
    const result = ok(await books.execute(mickey, { type: "CreatePaymentMethod", label: "Travel card", hints: { cardLast4: "1234" } }));
    expect(result.events).toEqual([
      {
        type: "PaymentMethodCreated",
        paymentMethodId: expect.any(String),
        claimantId: mickey.claimantId,
        label: "Travel card",
        hints: { bank: null, cardLast4: "1234", upiHandle: null },
      },
    ]);
    const id = (result.events[0] as { paymentMethodId: string }).paymentMethodId;
    expect(await methodsOf(mickey)).toEqual([{ id, label: "Travel card", hints: { bank: null, cardLast4: "1234", upiHandle: null }, archived: false }]);
    expect(await auditOf(id)).toMatchObject([
      { command: "CreatePaymentMethod", event: "PaymentMethodCreated", entity: "payment_method", actorId: mickey.claimantId, ownerId: mickey.claimantId, fromState: null, toState: "active" },
    ]);
  });

  it("carries every hint: bank name, card last four digits and UPI handle, each optional; listed oldest first", async () => {
    const mickey = claimant();
    const cash = await method(mickey, "Cash");
    const savings = await method(mickey, "Savings account", { bank: "Acme Bank", upiHandle: "mickey@acme" });
    expect(await methodsOf(mickey)).toEqual([
      { id: cash, label: "Cash", hints: NO_HINTS, archived: false },
      { id: savings, label: "Savings account", hints: { bank: "Acme Bank", cardLast4: null, upiHandle: "mickey@acme" }, archived: false },
    ]);
  });

  it("rename and hints: \"Travel card\" becomes \"Travel credit card\" ending 5678, from and to audited; keeping every value writes nothing", async () => {
    const mickey = claimant();
    const id = await method(mickey, "Travel card", { cardLast4: "1234" });
    const edited = ok(await books.execute(mickey, { type: "EditPaymentMethod", paymentMethodId: id, label: "Travel credit card", hints: { cardLast4: "5678" } }));
    expect(edited.events).toEqual([
      {
        type: "PaymentMethodEdited",
        paymentMethodId: id,
        changes: {
          label: { from: "Travel card", to: "Travel credit card" },
          hints: { from: { bank: null, cardLast4: "1234", upiHandle: null }, to: { bank: null, cardLast4: "5678", upiHandle: null } },
        },
      },
    ]);
    expect(await methodsOf(mickey)).toEqual([{ id, label: "Travel credit card", hints: { bank: null, cardLast4: "5678", upiHandle: null }, archived: false }]);
    expect((await auditOf(id)).at(-1)).toMatchObject({ command: "EditPaymentMethod", event: "PaymentMethodEdited", fromState: "active", toState: "active" });
    expect(await books.execute(mickey, { type: "EditPaymentMethod", paymentMethodId: id, label: "Travel credit card" })).toEqual({ ok: true, events: [] });
    expect(await auditOf(id)).toHaveLength(2);
  });

  it("Archived method: archiving it marks it archived, audited active → archived; archiving it again is invalid_transition", async () => {
    const mickey = claimant();
    const id = await method(mickey);
    expect(ok(await books.execute(mickey, { type: "ArchivePaymentMethod", paymentMethodId: id })).events).toEqual([{ type: "PaymentMethodArchived", paymentMethodId: id }]);
    expect(await methodsOf(mickey)).toMatchObject([{ id, archived: true }]);
    expect((await auditOf(id)).at(-1)).toMatchObject({ command: "ArchivePaymentMethod", fromState: "active", toState: "archived" });
    expect(await books.execute(mickey, { type: "ArchivePaymentMethod", paymentMethodId: id })).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("refuses a blank label and a card hint that is not four digits as validation, and writes nothing", async () => {
    const mickey = claimant();
    expect(await books.execute(mickey, { type: "CreatePaymentMethod", label: "  ", hints: {} })).toEqual({ ok: false, reason: "validation", field: "label" });
    for (const cardLast4 of ["123", "12345", "12a4"])
      expect(await books.execute(mickey, { type: "CreatePaymentMethod", label: "Travel card", hints: { cardLast4 } }), cardLast4).toEqual({ ok: false, reason: "validation", field: "hints" });
    expect(await books.execute(mickey, { type: "CreatePaymentMethod", label: "Travel card", hints: { bank: 7 } } as never)).toEqual({ ok: false, reason: "validation", field: "hints" });
    expect(await methodsOf(mickey)).toEqual([]);
    const id = await method(mickey);
    expect(await books.execute(mickey, { type: "EditPaymentMethod", paymentMethodId: id, label: "" })).toEqual({ ok: false, reason: "validation", field: "label" });
    expect(await books.execute(mickey, { type: "EditPaymentMethod", paymentMethodId: id, hints: { cardLast4: "99" } })).toEqual({ ok: false, reason: "validation", field: "hints" });
    expect(await auditOf(id)).toHaveLength(1);
  });
});

describe("Payment method access", () => {
  it("Methods are private: another Claimant does not see it, and editing or archiving it is not_found, the same as one that does not exist", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const id = await method(mickey);
    expect(await methodsOf(dexter)).toEqual([]);
    for (const paymentMethodId of [id, randomUUID(), "not-a-uuid", "constructor", "__proto__", "toString"]) {
      expect(await books.execute(dexter, { type: "EditPaymentMethod", paymentMethodId, label: "Mine now" }), paymentMethodId).toEqual({ ok: false, reason: "not_found" });
      expect(await books.execute(dexter, { type: "ArchivePaymentMethod", paymentMethodId }), paymentMethodId).toEqual({ ok: false, reason: "not_found" });
    }
    expect(await methodsOf(mickey)).toEqual([{ id, label: "Travel card", hints: NO_HINTS, archived: false }]);
    expect(await auditOf(id)).toHaveLength(1);
  });

  it("an admin by session sees and archives another Claimant's method, audited with the admin as actor and the Claimant as owner; over MCP or Intake it is not_found", async () => {
    const [mickey, minnie] = [claimant(), admin()];
    const id = await method(mickey);
    for (const via of ["mcp", "intake"] as const) {
      const remote = { ...minnie, via };
      expect((await methodsOf(remote)).some((m) => m.id === id)).toBe(false);
      expect(await books.execute(remote, { type: "ArchivePaymentMethod", paymentMethodId: id })).toEqual({ ok: false, reason: "not_found" });
    }
    expect((await methodsOf(minnie)).find((m) => m.id === id)).toEqual({ id, label: "Travel card", hints: NO_HINTS, archived: false });
    ok(await books.execute(minnie, { type: "ArchivePaymentMethod", paymentMethodId: id }));
    expect(await methodsOf(mickey)).toMatchObject([{ id, archived: true }]);
    expect((await auditOf(id)).at(-1)).toMatchObject({ command: "ArchivePaymentMethod", actorId: minnie.claimantId, ownerId: mickey.claimantId });
  });

  it("a role-less Actor is forbidden from every Payment method command and query", async () => {
    const roleless: Actor = { claimantId: randomUUID(), roles: ["admin"], via: "session" };
    const forbidden = { ok: false, reason: "forbidden" };
    expect(await books.execute(roleless, { type: "CreatePaymentMethod", label: "Cash", hints: {} })).toEqual(forbidden);
    expect(await books.execute(roleless, { type: "EditPaymentMethod", paymentMethodId: randomUUID(), label: "Cash" })).toEqual(forbidden);
    expect(await books.execute(roleless, { type: "ArchivePaymentMethod", paymentMethodId: randomUUID() })).toEqual(forbidden);
    expect(await books.paymentMethods(roleless)).toEqual(forbidden);
  });
});
