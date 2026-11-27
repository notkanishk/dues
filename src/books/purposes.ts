// Purposes inside Books (expense-tracking "Purpose"): an optional group inside a Fund, one Claimant's own. Pure rules
// first, then the shell's loads, writes and reads, as for Funds.
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { funds, purposes } from "@/src/db/schema";
import type { Tx } from "./books";
import { type Actor, isAdmin, MAKERSPACE, own, type Rejected, reject, rejectField } from "./core";
import { isUuid, listFunds, visible } from "./funds";

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
export type PurposeDecision = { readonly ok: true; readonly events: readonly PurposeEvent[] } | Rejected;

/** Pure: what a Purpose command does, given what the Actor reaches (absent = not_found, so existence does not leak). */
export function decidePurpose(slice: PurposeSlice, command: PurposeCommand, actor: Actor): PurposeDecision {
  if (command.type === "CreatePurpose") {
    if (typeof command.name !== "string" || !command.name.trim()) return rejectField("name");
    if (!slice.fundIds.includes(command.fundId)) return reject("not_found");
    return { ok: true, events: [{ type: "PurposeCreated", purposeId: slice.newId!, claimantId: actor.claimantId, fundId: command.fundId, name: command.name.trim() }] };
  }
  const purpose = own(slice.purposes, command.purposeId);
  if (!purpose) return reject("not_found");
  if (!purpose.active) return reject("invalid_transition");
  return { ok: true, events: [{ type: "PurposeEnded", purposeId: purpose.id }] };
}

// ---- Shell ---------------------------------------------------------------------------------------------------------

type Q = Pick<NodePgDatabase, "select">;
/** The ownership filter (design D6): an admin by session reaches every Claimant's Purposes; anyone else their own. */
const scope = (actor: Actor) => (isAdmin(actor) ? undefined : eq(purposes.claimantId, actor.claimantId));

const reached = (q: Q, actor: Actor, ids: readonly string[]) => {
  const wanted = ids.filter(isUuid);
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
    const fundIds = isUuid(command.fundId)
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

// ---- The upload and payment prompt (expense-tracking "Purpose", "Funds on the upload prompt"; FUNCTIONAL W1 step 5) ----

/**
 * Pure: what the prompt preselects, and so where a payment goes when nobody answers. The one active Purpose, in its
 * Fund; else the Fund every active Purpose is in; else Makerspace (or, hidden, the Claimant's first Fund).
 */
// ponytail: two or more active Purposes in different Funds preselect Makerspace, and an ordered list still preselects
// Makerspace; the spec states neither (listed for the owner).
export function preselect(fundIds: readonly string[], active: readonly { readonly id: string; readonly fundId: string }[]) {
  const inFunds = [...new Set(active.map((p) => p.fundId))];
  const fundId = inFunds.length === 1 ? inFunds[0]! : fundIds.includes(MAKERSPACE) ? MAKERSPACE : (fundIds[0] ?? MAKERSPACE);
  return { fundId, purposeId: active.length === 1 ? active[0]!.id : null };
}

/**
 * The prompt for the Actor's own payments: the Funds they are offered, in their order, with the hint in effect for
 * them; their own active Purposes in those Funds (none: no Purpose step; any: None is always a choice); what is preselected.
 * An admin's is their own: no other Claimant's Purpose or private Fund.
 */
export async function promptOf(q: Q, actor: Actor) {
  const offered = (await listFunds(q, actor, "prompt")).filter((f) => !f.hidden && !f.archived);
  const fundIds = offered.map((f) => f.id);
  const active = (
    await q
      .select({ id: purposes.id, name: purposes.name, fundId: purposes.fundId })
      .from(purposes)
      .where(and(eq(purposes.claimantId, actor.claimantId), eq(purposes.active, true)))
      .orderBy(purposes.id)
  ).filter((p) => fundIds.includes(p.fundId));
  const chosen = preselect(fundIds, active);
  return {
    funds: offered.map((f) => ({ id: f.id, name: f.name, whatForHint: f.effective.whatForHint })),
    purposes: active,
    preselectedFundId: chosen.fundId,
    preselectedPurposeId: chosen.purposeId,
  };
}
