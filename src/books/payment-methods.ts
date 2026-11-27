// Payment methods inside Books (identity-access "Claimant-defined Payment methods"): one Claimant's own labels with
// optional match hints, none hard-coded. Pure rules first, then the shell's loads, writes and reads, as for Purposes.
// ponytail: here, beside Purposes, until Claimants (task 2.7) exists; the Expense's link is checked under Books' lock.
import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { paymentMethods } from "@/src/db/schema";
import type { Tx } from "./books";
import { type Actor, type Change, isAdmin, own, type Rejected, reject, rejectField } from "./core";
import { isUuid } from "./funds";

/** What a payment confirmation is recognised by (FUNCTIONAL §2 Claimant): each optional. */
export type Hints = { readonly bank: string | null; readonly cardLast4: string | null; readonly upiHandle: string | null };
type HintsInput = { readonly bank?: string | null; readonly cardLast4?: string | null; readonly upiHandle?: string | null };

export type CreatePaymentMethod = { readonly type: "CreatePaymentMethod"; readonly label: string; readonly hints?: HintsInput };
/** Rename, or set the hints: given hints replace all three (one omitted is none). */
export type EditPaymentMethod = { readonly type: "EditPaymentMethod"; readonly paymentMethodId: string; readonly label?: string; readonly hints?: HintsInput };
/** No longer offered for new Payments; Expenses that used it keep it. */
export type ArchivePaymentMethod = { readonly type: "ArchivePaymentMethod"; readonly paymentMethodId: string };
export type PaymentMethodCommand = CreatePaymentMethod | EditPaymentMethod | ArchivePaymentMethod;
/** Every Payment method command, once: the type makes a new one fail the typecheck until it is listed here. */
const COMMAND_TYPES: Record<PaymentMethodCommand["type"], true> = { CreatePaymentMethod: true, EditPaymentMethod: true, ArchivePaymentMethod: true };
const COMMANDS: readonly string[] = Object.keys(COMMAND_TYPES);
export const isPaymentMethodCommand = (command: { type: string }): command is PaymentMethodCommand => COMMANDS.includes(command.type);

export type PaymentMethodEvent =
  | { readonly type: "PaymentMethodCreated"; readonly paymentMethodId: string; readonly claimantId: string; readonly label: string; readonly hints: Hints }
  | { readonly type: "PaymentMethodEdited"; readonly paymentMethodId: string; readonly changes: { readonly label?: Change<string>; readonly hints?: Change<Hints> } }
  | { readonly type: "PaymentMethodArchived"; readonly paymentMethodId: string };

type MethodState = { readonly id: string; readonly claimantId: string; readonly label: string; readonly hints: Hints; readonly archived: boolean };
/** newId for a new method; the methods named that the Actor reaches (absent = not_found, so existence does not leak). */
export type PaymentMethodSlice = { readonly newId: string | null; readonly methods: Readonly<Record<string, MethodState>> };
export type PaymentMethodDecision = { readonly ok: true; readonly events: readonly PaymentMethodEvent[] } | Rejected;

const isLabel = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isHint = (v: unknown) => v === undefined || v === null || typeof v === "string";
/** A hint's text, trimmed; blank or whitespace-only is none. */
const hintText = (v: unknown) => (typeof v === "string" && v.trim()) || null;
/** The three hints, blank ones none; null when any is malformed. A card hint is its last four digits. */
function hintsOf(input: unknown): Hints | null {
  if (input === undefined) return { bank: null, cardLast4: null, upiHandle: null };
  if (typeof input !== "object" || input === null) return null;
  const { bank, cardLast4, upiHandle } = input as Record<string, unknown>;
  if (![bank, cardLast4, upiHandle].every(isHint)) return null;
  const hints = { bank: hintText(bank), cardLast4: hintText(cardLast4), upiHandle: hintText(upiHandle) };
  if (hints.cardLast4 !== null && !/^[0-9]{4}$/.test(hints.cardLast4)) return null;
  return hints;
}

/** Pure: what a Payment method command does, given what the Actor reaches. */
export function decidePaymentMethod(slice: PaymentMethodSlice, command: PaymentMethodCommand, actor: Actor): PaymentMethodDecision {
  if (command.type === "CreatePaymentMethod") {
    if (!isLabel(command.label)) return rejectField("label");
    const hints = hintsOf(command.hints);
    if (!hints) return rejectField("hints");
    return { ok: true, events: [{ type: "PaymentMethodCreated", paymentMethodId: slice.newId!, claimantId: actor.claimantId, label: command.label.trim(), hints }] };
  }
  const method = own(slice.methods, command.paymentMethodId);
  if (!method) return reject("not_found");
  if (command.type === "ArchivePaymentMethod") {
    if (method.archived) return reject("invalid_transition");
    return { ok: true, events: [{ type: "PaymentMethodArchived", paymentMethodId: method.id }] };
  }
  if (command.label !== undefined && !isLabel(command.label)) return rejectField("label");
  const hints = command.hints === undefined ? method.hints : hintsOf(command.hints);
  if (!hints) return rejectField("hints");
  const label = command.label?.trim() ?? method.label;
  const changes = {
    ...(label !== method.label && { label: { from: method.label, to: label } }),
    ...(!isDeepStrictEqual(hints, method.hints) && { hints: { from: method.hints, to: hints } }),
  };
  // Keeping every value changes nothing and writes nothing.
  if (!Object.keys(changes).length) return { ok: true, events: [] };
  return { ok: true, events: [{ type: "PaymentMethodEdited", paymentMethodId: method.id, changes }] };
}

// ---- Shell ---------------------------------------------------------------------------------------------------------

type Q = Pick<NodePgDatabase, "select">;
/** The ownership filter (design D6): an admin by session reaches every Claimant's methods; anyone else their own. */
const scope = (actor: Actor) => (isAdmin(actor) ? undefined : eq(paymentMethods.claimantId, actor.claimantId));
const stateOf = (r: typeof paymentMethods.$inferSelect): MethodState => ({
  id: r.id,
  claimantId: r.claimantId,
  label: r.label,
  hints: { bank: r.hintBank, cardLast4: r.hintCardLast4, upiHandle: r.hintUpiHandle },
  archived: r.archived,
});

const reached = (q: Q, actor: Actor, ids: readonly string[]) => {
  const wanted = ids.filter(isUuid);
  return wanted.length ? q.select().from(paymentMethods).where(and(inArray(paymentMethods.id, wanted), scope(actor))) : Promise.resolve([]);
};

/** Whose lock (D5): a new method is the Actor's; any other command takes its Claimant's. A method never changes Claimant. */
export async function paymentMethodOwners(tx: Tx, actor: Actor, command: PaymentMethodCommand): Promise<string[]> {
  if (command.type === "CreatePaymentMethod") return [actor.claimantId];
  const [row] = await reached(tx, actor, [command.paymentMethodId]);
  return [row?.claimantId ?? actor.claimantId];
}

export async function loadPaymentMethodSlice(tx: Tx, actor: Actor, command: PaymentMethodCommand): Promise<PaymentMethodSlice> {
  if (command.type === "CreatePaymentMethod") return { newId: (await tx.execute<{ id: string }>(sql`select uuidv7() as id`)).rows[0]!.id, methods: {} };
  const rows = await reached(tx, actor, [command.paymentMethodId]);
  return { newId: null, methods: Object.fromEntries(rows.map((r) => [r.id, stateOf(r)])) };
}

/** Audit entries (D2): the method's Claimant owns it, whoever acts. */
export function paymentMethodEntries(slice: PaymentMethodSlice, events: readonly PaymentMethodEvent[]) {
  return events.map((event) => {
    const was = event.type === "PaymentMethodCreated" ? null : slice.methods[event.paymentMethodId]!;
    const fromState = was && (was.archived ? "archived" : "active");
    return {
      ownerId: event.type === "PaymentMethodCreated" ? event.claimantId : was!.claimantId,
      event: event.type,
      entity: "payment_method",
      entityId: event.paymentMethodId,
      fromState,
      toState: event.type === "PaymentMethodArchived" ? "archived" : (fromState ?? "active"),
      payload: event,
    };
  });
}

const hintColumns = (h: Hints) => ({ hintBank: h.bank, hintCardLast4: h.cardLast4, hintUpiHandle: h.upiHandle });

export async function writePaymentMethod(tx: Tx, event: PaymentMethodEvent, at: Date) {
  switch (event.type) {
    case "PaymentMethodCreated":
      await tx.insert(paymentMethods).values({ id: event.paymentMethodId, claimantId: event.claimantId, label: event.label, ...hintColumns(event.hints), createdAt: at });
      return;
    case "PaymentMethodEdited": {
      const { label, hints } = event.changes;
      await tx
        .update(paymentMethods)
        .set({ ...(label && { label: label.to }), ...(hints && hintColumns(hints.to)) })
        .where(eq(paymentMethods.id, event.paymentMethodId));
      return;
    }
    case "PaymentMethodArchived":
      await tx.update(paymentMethods).set({ archived: true }).where(eq(paymentMethods.id, event.paymentMethodId));
  }
}

/** The Actor's Payment methods, oldest first (keys are UUIDv7), archived included; an admin's by session, everyone's (D6). */
export async function listPaymentMethods(q: Q, actor: Actor) {
  const rows = await q.select().from(paymentMethods).where(scope(actor)).orderBy(paymentMethods.id);
  return rows.map((r) => {
    const { id, label, hints, archived } = stateOf(r);
    return { id, label, hints, archived };
  });
}
