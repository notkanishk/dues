// Purposes inside Books (expense-tracking "Purpose"): an optional group inside a Fund, one Claimant's own. Pure rules
// first, then the shell's loads, writes and reads, as for Funds.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { funds, purposes } from "@/src/db/schema";
import type { Tx } from "./books";
import { type Actor, isAdmin } from "./core";
import { UUID, visible } from "./funds";

/**
 * A new Purpose of the Actor's own, active, in the Fund named. The Fund is always given: which Fund a new Purpose
 * starts on is the UI's, and still open (design Open Question 16).
 */
export type CreatePurpose = { readonly type: "CreatePurpose"; readonly name: string; readonly fundId: string };
/** "End trip": it stops catching new payments; its Expenses keep it. */
export type EndPurpose = { readonly type: "EndPurpose"; readonly purposeId: string };
export type PurposeCommand = CreatePurpose | EndPurpose;
/** Every Purpose command, once: the type makes a new one fail the typecheck until it is listed here. */
const PURPOSE_COMMAND_TYPES: Record<PurposeCommand["type"], true> = { CreatePurpose: true, EndPurpose: true };
const PURPOSE_COMMANDS: readonly string[] = Object.keys(PURPOSE_COMMAND_TYPES);
export const isPurposeCommand = (command: { type: string }): command is PurposeCommand => PURPOSE_COMMANDS.includes(command.type);

export type PurposeEvent =
  | { readonly type: "PurposeCreated"; readonly purposeId: string; readonly claimantId: string; readonly fundId: string; readonly name: string }
  | { readonly type: "PurposeEnded"; readonly purposeId: string };

type PurposeState = { readonly id: string; readonly claimantId: string; readonly active: boolean };
/** newId for a new Purpose; the Funds named that the Actor has; the Purposes named that the Actor reaches. */
export type PurposeSlice = { readonly newId: string | null; readonly fundIds: readonly string[]; readonly purposes: Readonly<Record<string, PurposeState>> };
type Rejection = { readonly ok: false; readonly reason: "not_found" | "invalid_transition" | "validation"; readonly field?: string };
export type PurposeDecision = { readonly ok: true; readonly events: readonly PurposeEvent[] } | Rejection;

/** Pure: what a Purpose command does, given what the Actor reaches (absent = not_found, so existence does not leak). */
export function decidePurpose(slice: PurposeSlice, command: PurposeCommand, actor: Actor): PurposeDecision {
  if (command.type === "CreatePurpose") {
    if (typeof command.name !== "string" || !command.name.trim()) return { ok: false, reason: "validation", field: "name" };
    if (!slice.fundIds.includes(command.fundId)) return { ok: false, reason: "not_found" };
    return { ok: true, events: [{ type: "PurposeCreated", purposeId: slice.newId!, claimantId: actor.claimantId, fundId: command.fundId, name: command.name.trim() }] };
  }
  const purpose = slice.purposes[command.purposeId];
  if (!purpose) return { ok: false, reason: "not_found" };
  if (!purpose.active) return { ok: false, reason: "invalid_transition" };
  return { ok: true, events: [{ type: "PurposeEnded", purposeId: purpose.id }] };
}

// ---- Shell ---------------------------------------------------------------------------------------------------------

type Q = Pick<NodePgDatabase, "select">;
/** The ownership filter (design D6): an admin by session reaches every Claimant's Purposes; anyone else their own. */
const scope = (actor: Actor) => (isAdmin(actor) ? undefined : eq(purposes.claimantId, actor.claimantId));

const reached = (q: Q, actor: Actor, ids: readonly string[]) => {
  const wanted = ids.filter((id) => typeof id === "string" && UUID.test(id));
  return wanted.length ? q.select().from(purposes).where(and(inArray(purposes.id, wanted), scope(actor))) : Promise.resolve([]);
};

/** Whose lock (D5): a new Purpose is the Actor's; ending one takes its Claimant's. A Purpose never changes Claimant. */
export async function purposeOwners(tx: Tx, actor: Actor, command: PurposeCommand): Promise<string[]> {
  if (command.type === "CreatePurpose") return [actor.claimantId];
  const [row] = await reached(tx, actor, [command.purposeId]);
  return [row?.claimantId ?? actor.claimantId];
}

export async function loadPurposeSlice(tx: Tx, actor: Actor, command: PurposeCommand): Promise<PurposeSlice> {
  if (command.type === "CreatePurpose") {
    const newId = (await tx.execute<{ id: string }>(sql`select uuidv7() as id`)).rows[0]!.id;
    const fundIds = UUID.test(command.fundId ?? "")
      ? (await tx.select({ id: funds.id }).from(funds).where(and(eq(funds.id, command.fundId), visible(actor)))).map((r) => r.id)
      : [];
    return { newId, fundIds, purposes: {} };
  }
  const rows = await reached(tx, actor, [command.purposeId]);
  return { newId: null, fundIds: [], purposes: Object.fromEntries(rows.map((r) => [r.id, r])) };
}

/** Audit entries (D2): the Purpose's Claimant owns it, whoever acts. */
export function purposeEntries(slice: PurposeSlice, events: readonly PurposeEvent[]) {
  return events.map((event) => ({
    ownerId: event.type === "PurposeCreated" ? event.claimantId : slice.purposes[event.purposeId]!.claimantId,
    event: event.type,
    entity: "purpose",
    entityId: event.purposeId,
    fromState: event.type === "PurposeCreated" ? null : "active",
    toState: event.type === "PurposeCreated" ? "active" : "ended",
    payload: event,
  }));
}

export async function writePurpose(tx: Tx, event: PurposeEvent, at: Date) {
  if (event.type === "PurposeCreated")
    await tx.insert(purposes).values({ id: event.purposeId, claimantId: event.claimantId, fundId: event.fundId, name: event.name, createdAt: at });
  else await tx.update(purposes).set({ active: false }).where(eq(purposes.id, event.purposeId));
}

/** The Actor's Purposes, oldest first (keys are UUIDv7); an admin's by session, everyone's (D6). */
export async function listPurposes(q: Q, actor: Actor) {
  return q
    .select({ id: purposes.id, name: purposes.name, fundId: purposes.fundId, active: purposes.active })
    .from(purposes)
    .where(scope(actor))
    .orderBy(purposes.id);
}
