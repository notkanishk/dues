// Funds inside Books (design §1 lists the Fund command family there): pure rules first, then the shell's loads, writes
// and reads. Claims, Purposes and the Advance read Funds in Books' transaction, so they live under the same Actor Seam.
import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { expenses, funds, fundSettings, fundVersions, refunds } from "@/src/db/schema";
import { type Money, zero } from "@/src/money/money";
import type { Tx } from "./books";
import { type Actor, advanceLeft, advanceState, isAdmin, MAKERSPACE, own } from "./core";

export { MAKERSPACE };

export type Mail = { readonly to: readonly string[]; readonly cc: readonly string[]; readonly subject: string; readonly body: string };
/** What "my version" may override (claims, "Personal versions and the snapshot"). */
export type Overridable = {
  readonly mail: Mail | null;
  readonly formTemplate: string | null;
  readonly fileNamePattern: string | null;
  readonly whatForHint: string | null;
};
const OVERRIDABLE = ["mail", "formTemplate", "fileNamePattern", "whatForHint"] as const satisfies readonly (keyof Overridable)[];

type Q = Pick<NodePgDatabase, "select">;
/** The Funds a Claimant has: their own and every team Fund. */
export const visible = (who: Pick<Actor, "claimantId">) => or(eq(funds.team, true), eq(funds.creatorId, who.claimantId));
/** An admin reaches every Fund (D6); anyone else the Funds they have. */
const reachable = (actor: Actor) => (isAdmin(actor) ? undefined : visible(actor));

/**
 * Every Fund the Actor can use, their own private ones and every team Fund, in the Actor's order. In Settings an admin
 * also sees every other Claimant's private Fund (D6); the prompt offers an admin only the Funds they have.
 */
export async function listFunds(q: Q, actor: Actor, view: "settings" | "prompt") {
  const rows = await q
    .select({ fund: funds, mine: fundVersions, setting: fundSettings })
    .from(funds)
    .leftJoin(fundVersions, and(eq(fundVersions.fundId, funds.id), eq(fundVersions.claimantId, actor.claimantId)))
    .leftJoin(fundSettings, and(eq(fundSettings.fundId, funds.id), eq(fundSettings.claimantId, actor.claimantId)))
    .where(view === "settings" ? reachable(actor) : visible(actor));
  return rows.sort(byOrder).map(({ fund, mine, setting }) => {
    const teamVersion = pick(fund);
    const myVersion = mine && (Object.fromEntries(OVERRIDABLE.flatMap((k) => (mine[k] === null ? [] : [[k, mine[k]]]))) as Partial<Overridable>);
    return {
      id: fund.id,
      name: fund.name,
      notes: fund.notes, // shown to Claimants in Dues; never in fundTemplates
      sharing: fund.team ? ("team" as const) : ("private" as const),
      archived: fund.archived,
      hidden: setting?.hidden ?? false,
      /** The Actor's own Advance total on it, null while off; never another Claimant's. */
      advance: setting?.advancePaise == null ? null : ({ paise: setting.advancePaise, currency: "INR" } as Money),
      mayEditTeam: fund.creatorId === actor.claimantId || isAdmin(actor),
      claimNamePattern: fund.claimNamePattern,
      teamVersion,
      myVersion,
      // "Team version updated. Compare": the team changed under this Claimant's version; compare teamVersion with myVersion.
      teamUpdated: mine !== null && mine.basedOn < fund.teamVersion,
      effective: { ...teamVersion, ...myVersion, claimNamePattern: fund.claimNamePattern },
    };
  });
}

const pick = (row: { mail: unknown; formTemplate: string | null; fileNamePattern: string | null; whatForHint: string | null }): Overridable => ({
  mail: row.mail as Mail | null, // written only through validMail
  formTemplate: row.formTemplate,
  fileNamePattern: row.fileNamePattern,
  whatForHint: row.whatForHint,
});

/** The Claimant's order first, then the rest with Makerspace first and the others oldest first (keys are UUIDv7). */
type Ordered = { fund: { id: string }; setting: { position: number | null } | null };
const byOrder = (a: Ordered, b: Ordered) => {
  const rank = (r: Ordered) => [r.setting?.position ?? Number.MAX_SAFE_INTEGER, r.fund.id === MAKERSPACE ? 0 : 1] as const;
  const [x, y] = [rank(a), rank(b)];
  return x[0] - y[0] || x[1] - y[1] || (a.fund.id < b.fund.id ? -1 : 1);
};

// ---- Commands (design §1 Fund family) ------------------------------------------------------------------------------

/** The team version's fields: what the creator or an admin edits (claims, "Fund fields"). */
export type TeamFields = Overridable & { readonly name: string; readonly notes: string | null; readonly claimNamePattern: string | null };
/** A new Fund, private to its creator. */
export type CreateFund = { readonly type: "CreateFund" } & Pick<TeamFields, "name"> & Partial<Omit<TeamFields, "name">>;
/** Edits a Fund's team version (or a private Fund): its creator or an admin only. Only the fields given change. */
export type EditFund = { readonly type: "EditFund"; readonly fundId: string } & Partial<TeamFields>;
/** "Share with team": every Claimant can use it. */
export type ShareFund = { readonly type: "ShareFund"; readonly fundId: string };
/** Archive: off the upload prompt, its history kept. Who may: as for EditFund. */
export type ArchiveFund = { readonly type: "ArchiveFund"; readonly fundId: string };
/** "My version" of a team Fund, for the Actor only. A field given as null goes back to the team's. */
export type SetPersonalVersion = { readonly type: "SetPersonalVersion"; readonly fundId: string } & Partial<Overridable>;
/** "Reset to team version". */
export type ResetToTeamVersion = { readonly type: "ResetToTeamVersion"; readonly fundId: string };
/** The Actor's own order: these Funds first, in this order; any other after them in the default order. */
export type OrderFunds = { readonly type: "OrderFunds"; readonly fundIds: readonly string[] };
/** Hides a Fund from the Actor's own prompt, or shows it again. */
export type HideFund = { readonly type: "HideFund"; readonly fundId: string; readonly hidden: boolean };
/**
 * The Actor's own Advance on a Fund they have (identity-access "Advance is a personal amount on a Fund"): a total turns
 * it on or replaces the total (never a top-up); null turns it off. Never another Claimant's, an admin's included.
 */
export type SetAdvance = { readonly type: "SetAdvance"; readonly fundId: string; readonly total: Money | null };
export type FundCommand = CreateFund | EditFund | ShareFund | ArchiveFund | SetPersonalVersion | ResetToTeamVersion | OrderFunds | HideFund | SetAdvance;
/** Every Fund command, once: the type makes a new one fail the typecheck until it is listed here. */
const FUND_COMMAND_TYPES: Record<FundCommand["type"], true> = {
  CreateFund: true,
  EditFund: true,
  ShareFund: true,
  ArchiveFund: true,
  SetPersonalVersion: true,
  ResetToTeamVersion: true,
  OrderFunds: true,
  HideFund: true,
  SetAdvance: true,
};
const FUND_COMMANDS: readonly string[] = Object.keys(FUND_COMMAND_TYPES);
export const isFundCommand = (command: { type: string }): command is FundCommand => FUND_COMMANDS.includes(command.type);
/** Commands on the Fund's own row (its team version); the rest change only the Actor's own settings. */
const ON_THE_FUND: readonly string[] = ["EditFund", "ShareFund", "ArchiveFund"] satisfies FundCommand["type"][];

type Change<T> = { readonly from: T; readonly to: T };
type Changes<T> = { readonly [K in keyof T]?: Change<T[K]> };
export type FundEvent =
  | { readonly type: "FundCreated"; readonly fundId: string; readonly creatorId: string; readonly fields: TeamFields }
  /** teamVersion is the team version after the edit; it goes up only when a field "my version" overrides changed. */
  | { readonly type: "FundEdited"; readonly fundId: string; readonly changes: Changes<TeamFields>; readonly teamVersion: number }
  | { readonly type: "FundShared"; readonly fundId: string }
  | { readonly type: "FundArchived"; readonly fundId: string }
  | { readonly type: "PersonalVersionSet"; readonly fundId: string; readonly claimantId: string; readonly changes: Changes<Overridable>; readonly basedOn: number }
  | { readonly type: "PersonalVersionReset"; readonly fundId: string; readonly claimantId: string }
  | { readonly type: "FundsOrdered"; readonly claimantId: string; readonly fundIds: readonly string[] }
  | { readonly type: "FundHidden"; readonly fundId: string; readonly claimantId: string; readonly hidden: boolean }
  | { readonly type: "AdvanceTurnedOn"; readonly fundId: string; readonly claimantId: string; readonly total: Money }
  | { readonly type: "AdvanceTotalChanged"; readonly fundId: string; readonly claimantId: string; readonly from: Money; readonly to: Money }
  | { readonly type: "AdvanceTurnedOff"; readonly fundId: string; readonly claimantId: string };
const ADVANCE_EVENTS: readonly string[] = ["AdvanceTurnedOn", "AdvanceTotalChanged", "AdvanceTurnedOff"] satisfies FundEvent["type"][];

export type FundState = {
  readonly id: string;
  readonly creatorId: string | null;
  readonly team: boolean;
  readonly archived: boolean;
  readonly teamVersion: number;
  readonly fields: TeamFields;
  /** The Actor's own version: null fields are the team's. */
  readonly mine: (Overridable & { readonly basedOn: number }) | null;
  readonly hidden: boolean;
  /** The Actor's own Advance total; null while off. */
  readonly advance: Money | null;
};
export type FundSlice = { readonly newId: string | null; readonly funds: Readonly<Record<string, FundState>> };
type Rejection = { readonly ok: false; readonly reason: "not_found" | "forbidden" | "invalid_transition" | "validation"; readonly field?: string };
export type FundDecision = { readonly ok: true; readonly events: readonly FundEvent[] } | Rejection;

const reject = (reason: Rejection["reason"], field?: string): Rejection => (field ? { ok: false, reason, field } : { ok: false, reason });
const isText = (v: unknown) => v === undefined || v === null || typeof v === "string";
const isStrings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string" && s.trim() !== "");
/** One validator for every path that writes a mail (create, edit, my version). */
const validMail = (v: unknown) => {
  if (v === undefined || v === null) return true;
  const m = v as Mail;
  return typeof v === "object" && isStrings(m.to) && isStrings(m.cc) && typeof m.subject === "string" && typeof m.body === "string";
};
const invalidField = (command: Partial<TeamFields>, keys: readonly (keyof TeamFields)[]) =>
  keys.find((k) => (k === "mail" ? !validMail(command.mail) : k === "name" ? command.name !== undefined && !command.name?.trim() : !isText(command[k])));
const TEAM_FIELDS = ["name", "notes", "claimNamePattern", ...OVERRIDABLE] as const satisfies readonly (keyof TeamFields)[];

/** Only the fields given, and only those whose value changes (compared as values: jsonb does not keep key order). */
function changesOf<T extends object>(from: T, command: Partial<T>, keys: readonly (keyof T)[]): Changes<T> {
  const out: Record<string, Change<unknown>> = {};
  for (const k of keys) {
    const to = command[k];
    if (to !== undefined && !isDeepStrictEqual(to, from[k])) out[k as string] = { from: from[k], to };
  }
  return out as Changes<T>;
}

/** One validator for every path that writes an Advance total: whole paise, zero or more, in rupees. */
const isAdvanceTotal = (v: unknown): v is Money =>
  typeof v === "object" && v !== null && Number.isSafeInteger((v as Money).paise) && (v as Money).paise >= 0 && (v as Money).currency === "INR";

const valuesOf = <T>(changes: Changes<T>) => Object.fromEntries(Object.entries(changes).map(([k, c]) => [k, (c as Change<unknown>).to]));

/** Pure: what a Fund command does, given the Funds it names as the Actor can reach them (absent = not_found). */
export function decideFund(slice: FundSlice, command: FundCommand, actor: Actor): FundDecision {
  const ok = (...events: FundEvent[]): FundDecision => ({ ok: true, events });
  if (command.type === "CreateFund") {
    const bad = invalidField(command, TEAM_FIELDS);
    if (bad || typeof command.name !== "string") return reject("validation", bad ?? "name");
    const fields: TeamFields = {
      name: command.name.trim(),
      mail: command.mail ?? null,
      notes: command.notes ?? null,
      formTemplate: command.formTemplate ?? null,
      fileNamePattern: command.fileNamePattern ?? null,
      claimNamePattern: command.claimNamePattern ?? null,
      whatForHint: command.whatForHint ?? null,
    };
    return ok({ type: "FundCreated", fundId: slice.newId!, creatorId: actor.claimantId, fields });
  }
  if (command.type === "OrderFunds") {
    const ids = command.fundIds;
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length) return reject("validation", "fundIds");
    if (ids.some((id) => !own(slice.funds, id))) return reject("not_found");
    return ok({ type: "FundsOrdered", claimantId: actor.claimantId, fundIds: ids });
  }
  const fund = own(slice.funds, command.fundId);
  if (!fund) return reject("not_found");
  // identity-access: only an admin and the creator edit the team version; anyone else is offered "my version".
  const mayEditTeam = fund.creatorId === actor.claimantId || isAdmin(actor);
  switch (command.type) {
    case "EditFund": {
      if (!mayEditTeam) return reject("forbidden");
      const bad = invalidField(command, TEAM_FIELDS);
      if (bad) return reject("validation", bad);
      const changes = changesOf(fund.fields, { ...command, name: command.name?.trim() }, TEAM_FIELDS);
      if (Object.keys(changes).length === 0) return ok(); // nothing changes, nothing is written
      const bumped = OVERRIDABLE.some((k) => k in changes);
      return ok({ type: "FundEdited", fundId: fund.id, changes, teamVersion: fund.teamVersion + (bumped ? 1 : 0) });
    }
    case "ShareFund":
      if (!mayEditTeam) return reject("forbidden");
      return fund.team ? reject("invalid_transition") : ok({ type: "FundShared", fundId: fund.id });
    case "ArchiveFund":
      if (!mayEditTeam) return reject("forbidden");
      return fund.archived ? reject("invalid_transition") : ok({ type: "FundArchived", fundId: fund.id });
    case "SetPersonalVersion": {
      if (!fund.team) return reject("invalid_transition"); // a private Fund has one version, its creator's
      const bad = invalidField(command, OVERRIDABLE);
      if (bad) return reject("validation", bad);
      const mine: Overridable = fund.mine ?? { mail: null, formTemplate: null, fileNamePattern: null, whatForHint: null };
      const changes = changesOf(mine, command, OVERRIDABLE);
      const after = { ...mine, ...valuesOf(changes) };
      // A version that overrides nothing is no version: the Claimant is on the team version.
      if (OVERRIDABLE.every((k) => after[k] === null))
        return fund.mine ? ok({ type: "PersonalVersionReset", fundId: fund.id, claimantId: actor.claimantId }) : ok();
      // Saved unchanged ("Keep mine") it still moves to the current team version, so Team version updated is acknowledged.
      if (Object.keys(changes).length === 0 && fund.mine?.basedOn === fund.teamVersion) return ok();
      return ok({ type: "PersonalVersionSet", fundId: fund.id, claimantId: actor.claimantId, changes, basedOn: fund.teamVersion });
    }
    case "ResetToTeamVersion":
      return fund.mine ? ok({ type: "PersonalVersionReset", fundId: fund.id, claimantId: actor.claimantId }) : reject("invalid_transition");
    case "HideFund":
      if (typeof command.hidden !== "boolean") return reject("validation", "hidden");
      return command.hidden === fund.hidden ? ok() : ok({ type: "FundHidden", fundId: fund.id, claimantId: actor.claimantId, hidden: command.hidden });
    case "SetAdvance": {
      const to = command.total;
      if (to !== null && !isAdvanceTotal(to)) return reject("validation", "total");
      const at = { fundId: fund.id, claimantId: actor.claimantId };
      const from = fund.advance;
      if (to === null) return from ? ok({ type: "AdvanceTurnedOff", ...at }) : ok();
      const total: Money = { paise: to.paise, currency: "INR" };
      if (!from) return ok({ type: "AdvanceTurnedOn", ...at, total });
      return from.paise === total.paise ? ok() : ok({ type: "AdvanceTotalChanged", ...at, from, to: total });
    }
  }
}

// ---- Shell: whose lock, the load, the writes ----------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The one key check before a lookup: anything else is never in the database, so it loads nothing (not_found). */
export const isUuid = (id: unknown): id is string => typeof id === "string" && UUID.test(id);
const idsOf = (command: FundCommand) =>
  (command.type === "CreateFund" ? [] : command.type === "OrderFunds" ? (Array.isArray(command.fundIds) ? command.fundIds : []) : [command.fundId]).filter(isUuid);

/**
 * Whose lock a Fund command takes (D5): the Fund's creator for a change to the Fund itself, so the creator's and an
 * admin's edits queue; the Actor's own for their order, hiding and version. A creator never changes, so it is not
 * re-checked under the lock; Makerspace has none, and its row lock (FOR UPDATE in loadFundSlice) serialises its edits and archive.
 */
export async function fundOwners(tx: Tx, actor: Actor, command: FundCommand): Promise<string[]> {
  if (!ON_THE_FUND.includes(command.type)) return [actor.claimantId];
  const [row] = await tx.select({ creatorId: funds.creatorId }).from(funds).where(and(inArray(funds.id, idsOf(command)), reachable(actor)));
  return [row?.creatorId ?? actor.claimantId];
}

export async function loadFundSlice(tx: Tx, actor: Actor, command: FundCommand): Promise<FundSlice> {
  const ids = idsOf(command);
  const newId =
    command.type === "CreateFund" ? (await tx.execute<{ id: string }>(sql`select uuidv7() as id`)).rows[0]!.id : null;
  if (ids.length === 0) return { newId, funds: {} };
  // A change to the Fund takes its row for update, so its edits queue. A command on the Actor's own settings only shares
  // it: the Fund stays as read until it commits, and many Claimants' orders and versions never queue on each other.
  const rows = await tx
    .select()
    .from(funds)
    // An Advance is only ever on a Fund the Actor has: an admin's reach to others' private Funds does not extend to it.
    .where(and(inArray(funds.id, ids), command.type === "SetAdvance" ? visible(actor) : reachable(actor)))
    .for(ON_THE_FUND.includes(command.type) ? "update" : "share");
  const mine = await tx.select().from(fundVersions).where(and(inArray(fundVersions.fundId, ids), eq(fundVersions.claimantId, actor.claimantId)));
  const settings = await tx.select().from(fundSettings).where(and(inArray(fundSettings.fundId, ids), eq(fundSettings.claimantId, actor.claimantId)));
  const states = rows.map((row): FundState => {
    const version = mine.find((v) => v.fundId === row.id);
    const setting = settings.find((s) => s.fundId === row.id);
    return {
      id: row.id,
      creatorId: row.creatorId,
      team: row.team,
      archived: row.archived,
      teamVersion: row.teamVersion,
      fields: { ...pick(row), name: row.name, notes: row.notes, claimNamePattern: row.claimNamePattern },
      mine: version ? { ...pick(version), basedOn: version.basedOn } : null,
      hidden: setting?.hidden ?? false,
      advance: setting?.advancePaise == null ? null : { paise: setting.advancePaise, currency: "INR" },
    };
  });
  return { newId, funds: Object.fromEntries(states.map((s) => [s.id, s])) };
}

const stateOf = (f: { team: boolean; archived: boolean } | undefined) => (!f ? null : f.archived ? "archived" : f.team ? "team" : "private");

/** Audit entries for a Fund command (D2): the Fund's creator owns a change to the Fund (the acting admin, for one with no creator), the Actor their own settings. */
// ponytail: no apply for Funds (deferred): each event's after-state is derived here; add apply when a Fund command emits
// several events whose later ones read earlier ones' effect.
export function fundEntries(slice: FundSlice, events: readonly FundEvent[], actor: Actor) {
  return events.map((event) => {
    if (event.type === "FundsOrdered")
      return { ownerId: actor.claimantId, event: event.type, entity: "fund_order", entityId: actor.claimantId, fromState: null, toState: null, payload: event };
    // The Advance is the Actor's own; its entry keeps every total it ever had (no top-up records).
    if (ADVANCE_EVENTS.includes(event.type))
      return {
        ownerId: actor.claimantId,
        event: event.type,
        entity: "advance",
        entityId: event.fundId,
        fromState: event.type === "AdvanceTurnedOn" ? "off" : "on",
        toState: event.type === "AdvanceTurnedOff" ? "off" : "on",
        payload: event,
      };
    const fund = slice.funds[event.fundId];
    const before = event.type === "FundCreated" ? undefined : fund;
    const after = event.type === "FundCreated" ? { team: false, archived: false } : event.type === "FundShared" ? { ...fund!, team: true } : event.type === "FundArchived" ? { ...fund!, archived: true } : fund;
    const onTheFund = ["FundCreated", "FundEdited", "FundShared", "FundArchived"].includes(event.type);
    return {
      ownerId: onTheFund ? (event.type === "FundCreated" ? event.creatorId : (fund!.creatorId ?? actor.claimantId)) : actor.claimantId,
      event: event.type,
      entity: "fund",
      entityId: event.fundId,
      fromState: stateOf(before),
      toState: stateOf(after),
      payload: event,
    };
  });
}

export async function writeFund(tx: Tx, event: FundEvent, at: Date) {
  switch (event.type) {
    case "FundCreated":
      await tx.insert(funds).values({ id: event.fundId, creatorId: event.creatorId, ...event.fields, createdAt: at });
      return;
    case "FundEdited":
      await tx.update(funds).set({ ...valuesOf(event.changes), teamVersion: event.teamVersion }).where(eq(funds.id, event.fundId));
      return;
    case "FundShared":
      await tx.update(funds).set({ team: true }).where(eq(funds.id, event.fundId));
      return;
    case "FundArchived":
      await tx.update(funds).set({ archived: true }).where(eq(funds.id, event.fundId));
      return;
    case "PersonalVersionSet": {
      const set = { ...valuesOf(event.changes), basedOn: event.basedOn };
      await tx
        .insert(fundVersions)
        .values({ fundId: event.fundId, claimantId: event.claimantId, ...set })
        .onConflictDoUpdate({ target: [fundVersions.fundId, fundVersions.claimantId], set });
      return;
    }
    case "PersonalVersionReset":
      await tx.delete(fundVersions).where(and(eq(fundVersions.fundId, event.fundId), eq(fundVersions.claimantId, event.claimantId)));
      return;
    case "FundsOrdered":
      await tx.update(fundSettings).set({ position: null }).where(eq(fundSettings.claimantId, event.claimantId));
      for (const [position, fundId] of event.fundIds.entries())
        await tx
          .insert(fundSettings)
          .values({ claimantId: event.claimantId, fundId, position })
          .onConflictDoUpdate({ target: [fundSettings.claimantId, fundSettings.fundId], set: { position } });
      return;
    case "FundHidden":
      await tx
        .insert(fundSettings)
        .values({ claimantId: event.claimantId, fundId: event.fundId, hidden: event.hidden })
        .onConflictDoUpdate({ target: [fundSettings.claimantId, fundSettings.fundId], set: { hidden: event.hidden } });
      return;
    case "AdvanceTurnedOn":
    case "AdvanceTotalChanged":
    case "AdvanceTurnedOff": {
      const advancePaise = event.type === "AdvanceTurnedOn" ? event.total.paise : event.type === "AdvanceTotalChanged" ? event.to.paise : null;
      await tx
        .insert(fundSettings)
        .values({ claimantId: event.claimantId, fundId: event.fundId, advancePaise })
        .onConflictDoUpdate({ target: [fundSettings.claimantId, fundSettings.fundId], set: { advancePaise } });
      return;
    }
  }
}

// ---- Reads for Claims ---------------------------------------------------------------------------------------------

/**
 * What a Claim of this Fund is made with (design §6 fundTemplates): the Actor's effective mail, form, file-name and
 * claim-name templates. Notes are not selected, so no Claim, mail or form built from this can carry them.
 */
export type FundTemplates = Pick<TeamFields, "mail" | "formTemplate" | "fileNamePattern" | "claimNamePattern">;
export async function templatesOf(q: Q, actor: Actor, fundId: string): Promise<FundTemplates | null> {
  if (!isUuid(fundId)) return null;
  const [row] = await q
    .select({
      team: { mail: funds.mail, formTemplate: funds.formTemplate, fileNamePattern: funds.fileNamePattern, claimNamePattern: funds.claimNamePattern },
      mine: { mail: fundVersions.mail, formTemplate: fundVersions.formTemplate, fileNamePattern: fundVersions.fileNamePattern },
    })
    .from(funds)
    .leftJoin(fundVersions, and(eq(fundVersions.fundId, funds.id), eq(fundVersions.claimantId, actor.claimantId)))
    .where(and(eq(funds.id, fundId), reachable(actor)));
  if (!row) return null;
  return {
    mail: (row.mine?.mail ?? row.team.mail) as Mail | null,
    formTemplate: row.mine?.formTemplate ?? row.team.formTemplate,
    fileNamePattern: row.mine?.fileNamePattern ?? row.team.fileNamePattern,
    claimNamePattern: row.team.claimNamePattern,
  };
}

// ---- The Advance, read (expense-tracking "Advance balance", "Home lists and the Advance block") --------------------

const paise = (rows: { fundId: string; paise: string | null }[]) => new Map(rows.map((r) => [r.fundId, { paise: Number(r.paise ?? 0), currency: "INR" as const }]));

/**
 * The Actor's own Advance on each Fund they have, in their order: total, Advance left and the block's state (hidden
 * while off). Only ever the Actor's own Advance over the Actor's own Expenses: an admin by session sees no other
 * Claimant's, since an Advance is personal and never shared (identity-access), and no query takes a Claimant (D6).
 */
export async function advancesOf(q: Q, actor: Actor) {
  const fundList = await listFunds(q, actor, "prompt");
  const on = fundList.flatMap((f) => (f.advance ? [f.id] : []));
  const [payments, received] = on.length
    ? await Promise.all([
        q
          .select({ fundId: expenses.fundId, paise: sql<string | null>`sum(${expenses.amountPaise})` })
          .from(expenses)
          // A duplicate is the same payment logged twice (FUNCTIONAL §7), so it is no Payment; personal and written off
          // stay spent (W2.9).
          .where(and(eq(expenses.claimantId, actor.claimantId), inArray(expenses.fundId, on), sql`${expenses.closedReason} is distinct from 'duplicate'`))
          .groupBy(expenses.fundId),
        q
          .select({ fundId: expenses.fundId, paise: sql<string | null>`sum(${refunds.amountPaise})` })
          .from(refunds)
          .innerJoin(expenses, eq(expenses.id, refunds.expenseId))
          .where(and(eq(expenses.claimantId, actor.claimantId), inArray(expenses.fundId, on), sql`${refunds.refundedOn} is not null`))
          .groupBy(expenses.fundId),
      ]).then(([p, r]) => [paise(p), paise(r)])
    : [new Map<string, Money>(), new Map<string, Money>()];
  return fundList.map((f) => {
    const total = f.advance;
    const left = total
      ? advanceLeft({
          total,
          payments: payments.get(f.id) ?? zero,
          refundsReceived: received.get(f.id) ?? zero,
          reimbursementsReceived: zero, // ponytail: no Claims yet; Claims plug Σ Reimbursements received for this Fund in here
        })
      : null;
    return { fundId: f.id, name: f.name, total, left, state: advanceState(total, left) };
  });
}
