import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@/src/db/index";
import { auditLog, funds } from "@/src/db/schema";
import { createBooks, type Result } from "./books";
import type { Actor } from "./core";
import { type CreateFund, MAKERSPACE } from "./funds";

// Fund scenarios through Books' Interface against a real Postgres (DATABASE_URL): claims "Funds define how a Claim is
// made", identity-access "Fund sharing and edit rights", expense-tracking "Funds on the upload prompt".
// Every test uses fresh Claimants; Makerspace is the one Fund they all share.

const NOW = new Date("2026-11-27T10:00:00.000Z");
const books = createBooks({ db, now: () => NOW, enqueue: async () => {} });
const claimant = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant"], via: "session" });
const admin = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant", "admin"], via: "session" });

const mail = (to: string, subject = "Claim {claim_name}") => ({ to: [to], cc: [], subject, body: "{breakdown}" });
const travelGrant = (extra: Partial<CreateFund> = {}): CreateFund => ({
  type: "CreateFund",
  name: "Travel grant",
  mail: mail("grants@toontown.example.org", "Travel claim {claim_name}"),
  notes: "Ask Goofy before filing",
  formTemplate: "travel-form.docx",
  fileNamePattern: "{what} {n}",
  claimNamePattern: "Travel{n}",
  whatForHint: "e.g. bus to the robotics meet",
  ...extra,
});
const ok = (result: Result) => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
  return result;
};
const created = async (actor: Actor, extra: Partial<CreateFund> = {}) => {
  const event = ok(await books.execute(actor, travelGrant(extra))).events[0];
  if (event?.type !== "FundCreated") throw new Error("expected FundCreated");
  return event.fundId;
};
const listed = async (actor: Actor) => {
  const read = await books.funds(actor);
  if (!read.ok) throw new Error(`expected funds, got ${JSON.stringify(read)}`);
  return read.funds;
};
const only = (ids: string[], list: { id: string }[]) => list.map((f) => f.id).filter((id) => ids.includes(id));
/** Puts Makerspace back as 0007 seeds it, after a test that edits or archives the one Fund every test shares. */
const resetMakerspace = () =>
  db
    .update(funds)
    .set({ name: "Makerspace", mail: null, notes: null, formTemplate: null, fileNamePattern: "{purpose} - {what} {kind}", claimNamePattern: "{Month}{n}", whatForHint: null, team: true, archived: false })
    .where(eq(funds.id, MAKERSPACE));
const auditOf = (fundId: string) => db.select().from(auditLog).where(eq(auditLog.entityId, fundId)).orderBy(auditLog.id);

beforeAll(() => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; these tests need a real Postgres");
});
afterAll(() => pool.end());

describe("Makerspace is a Fund", () => {
  it("a Claimant who signs in for the first time has Makerspace, a team Fund, first in their order", async () => {
    const mickey = claimant();
    const read = await books.funds(mickey);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.funds[0]).toMatchObject({
      id: MAKERSPACE,
      name: "Makerspace",
      sharing: "team",
      archived: false,
      hidden: false,
      effective: { fileNamePattern: "{purpose} - {what} {kind}", claimNamePattern: "{Month}{n}" },
    });
  });
  it("seeding Makerspace again leaves the one Makerspace as it is", async () => {
    const seed = readFileSync("drizzle/0007_funds.sql", "utf8").split("--> statement-breakpoint").find((s) => s.includes('INSERT INTO "funds"'))!;
    try {
      await db.update(funds).set({ notes: "Set in the app" }).where(eq(funds.id, MAKERSPACE));
      await pool.query(seed);
      expect((await listed(claimant())).filter((f) => f.id === MAKERSPACE)).toMatchObject([{ notes: "Set in the app" }]);
    } finally {
      await resetMakerspace();
    }
  });
});

describe("Fund sharing and edit rights", () => {
  it("Private by default: only its creator sees and uses a new Fund; to anyone else it is not_found", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const fundId = await created(mickey);

    // Other tests' team Funds share this database, so only these two are compared.
    expect(only([MAKERSPACE, fundId], await listed(mickey))).toEqual([MAKERSPACE, fundId]);
    expect((await listed(mickey)).find((f) => f.id === fundId)).toMatchObject({
      name: "Travel grant",
      notes: "Ask Goofy before filing",
      sharing: "private",
      mayEditTeam: true,
      effective: {
        mail: mail("grants@toontown.example.org", "Travel claim {claim_name}"),
        formTemplate: "travel-form.docx",
        fileNamePattern: "{what} {n}",
        claimNamePattern: "Travel{n}",
        whatForHint: "e.g. bus to the robotics meet",
      },
    });
    expect((await listed(dexter)).map((f) => f.id)).not.toContain(fundId);
    expect(await books.execute(dexter, { type: "EditFund", fundId, name: "Mine now" })).toEqual({ ok: false, reason: "not_found" });
    expect(await books.fundTemplates(dexter, fundId)).toEqual({ ok: false, reason: "not_found" });
    expect(await auditOf(fundId)).toMatchObject([
      { actorId: mickey.claimantId, ownerId: mickey.claimantId, command: "CreateFund", event: "FundCreated", entity: "fund", toState: "private" },
    ]);
  });

  it("Share with team: the creator shares it and every Claimant can use it", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const fundId = await created(mickey);
    expect(ok(await books.execute(mickey, { type: "ShareFund", fundId })).events).toEqual([{ type: "FundShared", fundId }]);

    expect((await listed(dexter)).find((f) => f.id === fundId)).toMatchObject({ sharing: "team", mayEditTeam: false, notes: "Ask Goofy before filing" });
    expect(await books.fundTemplates(dexter, fundId)).toMatchObject({ ok: true, templates: { claimNamePattern: "Travel{n}" } });
    expect(await books.execute(mickey, { type: "ShareFund", fundId })).toEqual({ ok: false, reason: "invalid_transition" });
    expect((await auditOf(fundId)).map((e) => [e.event, e.fromState, e.toState])).toEqual([
      ["FundCreated", null, "private"],
      ["FundShared", "private", "team"],
    ]);
  });

  it("Who edits the team version: a Claimant who is neither admin nor creator is refused as forbidden, nothing changes, and may make their own version", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const fundId = await created(mickey);
    ok(await books.execute(mickey, { type: "ShareFund", fundId }));
    const before = await listed(mickey);

    for (const command of [
      { type: "EditFund", fundId, mail: mail("dexter@lab.example.org") },
      { type: "EditFund", fundId, notes: "Dexter was here" },
      { type: "ArchiveFund", fundId },
    ] as const)
      expect(await books.execute(dexter, command), command.type).toEqual({ ok: false, reason: "forbidden" });
    expect(await books.execute(dexter, { type: "EditFund", fundId: MAKERSPACE, name: "Dexter's Lab" })).toEqual({ ok: false, reason: "forbidden" });
    expect(await listed(mickey)).toEqual(before);
    expect(await auditOf(fundId)).toHaveLength(2);
    // "offers my version instead"
    expect((await listed(dexter)).find((f) => f.id === fundId)?.mayEditTeam).toBe(false);
    expect(await books.execute(dexter, { type: "SetPersonalVersion", fundId, mail: mail("dexter@lab.example.org") })).toMatchObject({ ok: true });
  });

  it("Admin edit: an admin edits a team Fund's mail; every Claimant without their own version gets it, and the audit names the admin as actor", async () => {
    const [mickey, dexter, courage, minnie] = [claimant(), claimant(), claimant(), admin()];
    const fundId = await created(mickey);
    ok(await books.execute(mickey, { type: "ShareFund", fundId }));
    ok(await books.execute(courage, { type: "SetPersonalVersion", fundId, mail: mail("courage@farm.example.org") }));

    const edited = ok(await books.execute(minnie, { type: "EditFund", fundId, mail: mail("office@toontown.example.org") }));
    expect(edited.events).toEqual([
      {
        type: "FundEdited",
        fundId,
        changes: { mail: { from: mail("grants@toontown.example.org", "Travel claim {claim_name}"), to: mail("office@toontown.example.org") } },
        teamVersion: 2,
      },
    ]);
    for (const actor of [mickey, dexter])
      expect(await books.fundTemplates(actor, fundId)).toMatchObject({ ok: true, templates: { mail: mail("office@toontown.example.org") } });
    expect(await books.fundTemplates(courage, fundId)).toMatchObject({ ok: true, templates: { mail: mail("courage@farm.example.org") } });
    expect((await auditOf(fundId)).at(-1)).toMatchObject({
      actorId: minnie.claimantId,
      ownerId: mickey.claimantId,
      command: "EditFund",
      event: "FundEdited",
      fromState: "team",
      toState: "team",
    });
  });

  it("an admin sees another Claimant's private Fund in Settings, never on their own prompt, and edits it by id, audited as actor", async () => {
    const [mickey, minnie] = [claimant(), admin()];
    const fundId = await created(mickey);
    expect((await listed(minnie)).find((f) => f.id === fundId)).toMatchObject({ sharing: "private", mayEditTeam: true });
    const prompt = await books.promptFunds(minnie);
    expect(prompt.ok && prompt.funds.map((f) => f.id)).not.toContain(fundId);
    // Over MCP an admin's Settings hold only their own scope (D6).
    expect((await listed({ ...minnie, via: "mcp" })).map((f) => f.id)).not.toContain(fundId);
    ok(await books.execute(minnie, { type: "EditFund", fundId, notes: "Checked by the office" }));
    expect((await listed(mickey)).find((f) => f.id === fundId)?.notes).toBe("Checked by the office");
    expect((await auditOf(fundId)).at(-1)).toMatchObject({ actorId: minnie.claimantId, ownerId: mickey.claimantId, toState: "private" });
    // Over MCP an admin carries only their own scope (D6).
    expect(await books.execute({ ...minnie, via: "mcp" }, { type: "EditFund", fundId, notes: "x" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("Creator edit: the creator edits the team version and every Claimant without their own version gets it", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const fundId = await created(mickey);
    ok(await books.execute(mickey, { type: "ShareFund", fundId }));
    ok(await books.execute(mickey, { type: "EditFund", fundId, fileNamePattern: "{vendor} {n}", claimNamePattern: "Trip{n}" }));
    expect(await books.fundTemplates(dexter, fundId)).toMatchObject({ ok: true, templates: { fileNamePattern: "{vendor} {n}", claimNamePattern: "Trip{n}" } });
    expect((await auditOf(fundId)).at(-1)).toMatchObject({ actorId: mickey.claimantId, ownerId: mickey.claimantId });
  });
});

describe("Personal versions", () => {
  const sharedBy = async (creator: Actor) => {
    const fundId = await created(creator);
    ok(await books.execute(creator, { type: "ShareFund", fundId }));
    return fundId;
  };

  it("My version: a Claimant's own mail, form, file-name pattern and hint are theirs only; other Claimants keep the team version", async () => {
    const [mickey, dexter, courage] = [claimant(), claimant(), claimant()];
    const fundId = await sharedBy(mickey);
    const mine = { mail: mail("dexter@lab.example.org"), formTemplate: "dexter-form.docx", fileNamePattern: "{n} {what}", whatForHint: "e.g. lab coat" };
    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, ...mine }));

    expect(await books.fundTemplates(dexter, fundId)).toEqual({
      ok: true,
      templates: { mail: mine.mail, formTemplate: "dexter-form.docx", fileNamePattern: "{n} {what}", claimNamePattern: "Travel{n}" },
    });
    expect((await listed(dexter)).find((f) => f.id === fundId)).toMatchObject({ myVersion: mine, effective: mine, teamUpdated: false });
    for (const other of [mickey, courage]) {
      expect(await books.fundTemplates(other, fundId)).toMatchObject({
        ok: true,
        templates: { mail: mail("grants@toontown.example.org", "Travel claim {claim_name}"), formTemplate: "travel-form.docx", fileNamePattern: "{what} {n}" },
      });
      expect((await listed(other)).find((f) => f.id === fundId)).toMatchObject({ myVersion: null, effective: { whatForHint: "e.g. bus to the robotics meet" } });
    }
  });

  it("an empty version is no version: setting no field, or every field back to the team's, leaves the Claimant on the team version", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const fundId = await sharedBy(mickey);
    const versionOf = async () => (await listed(dexter)).find((f) => f.id === fundId)?.myVersion;
    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId }));
    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, mail: null, whatForHint: null }));
    expect(await versionOf()).toBeNull();

    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, fileNamePattern: "{n}", whatForHint: "e.g. bus" }));
    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, fileNamePattern: null, whatForHint: null }));
    expect(await versionOf()).toBeNull();
    expect(await books.execute(dexter, { type: "ResetToTeamVersion", fundId })).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("Keep mine: saving an unchanged version after a team edit acknowledges Team version updated and keeps the version", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const fundId = await sharedBy(mickey);
    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, mail: mail("dexter@lab.example.org") }));
    ok(await books.execute(mickey, { type: "EditFund", fundId, mail: mail("office@toontown.example.org") }));
    expect((await listed(dexter)).find((f) => f.id === fundId)?.teamUpdated).toBe(true);

    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, mail: mail("dexter@lab.example.org") }));
    expect((await listed(dexter)).find((f) => f.id === fundId)).toMatchObject({ teamUpdated: false, myVersion: { mail: mail("dexter@lab.example.org") } });
    // Once acknowledged, saving it again writes nothing.
    expect(ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, mail: mail("dexter@lab.example.org") })).events).toEqual([]);
  });

  it("a private Fund has no personal version: its creator edits it", async () => {
    const mickey = claimant();
    const fundId = await created(mickey);
    expect(await books.execute(mickey, { type: "SetPersonalVersion", fundId, whatForHint: "x" })).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("Reset: Reset to team version puts the Claimant back on the team version", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const fundId = await sharedBy(mickey);
    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, fileNamePattern: "{n}" }));
    expect(ok(await books.execute(dexter, { type: "ResetToTeamVersion", fundId })).events).toEqual([
      { type: "PersonalVersionReset", fundId, claimantId: dexter.claimantId },
    ]);
    expect(await books.fundTemplates(dexter, fundId)).toMatchObject({ ok: true, templates: { fileNamePattern: "{what} {n}" } });
    expect((await listed(dexter)).find((f) => f.id === fundId)?.myVersion).toBeNull();
    expect(await books.execute(dexter, { type: "ResetToTeamVersion", fundId })).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("Team version changed: an admin edits the team mail under a Claimant's version; that Claimant sees Team version updated, with both versions to compare", async () => {
    const [mickey, dexter, courage, minnie] = [claimant(), claimant(), claimant(), admin()];
    const fundId = await sharedBy(mickey);
    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, mail: mail("dexter@lab.example.org") }));
    // Name, notes and the claim-name pattern are no part of "my version": editing them is no news to it.
    ok(await books.execute(minnie, { type: "EditFund", fundId, notes: "New notes", name: "Travel and meets" }));
    expect((await listed(dexter)).find((f) => f.id === fundId)?.teamUpdated).toBe(false);

    ok(await books.execute(minnie, { type: "EditFund", fundId, mail: mail("office@toontown.example.org") }));
    expect((await listed(dexter)).find((f) => f.id === fundId)).toMatchObject({
      teamUpdated: true,
      teamVersion: { mail: mail("office@toontown.example.org") },
      myVersion: { mail: mail("dexter@lab.example.org") },
    });
    expect((await listed(courage)).find((f) => f.id === fundId)?.teamUpdated).toBe(false); // no version of their own
    // Editing their version again brings it up to date; so does Reset.
    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, whatForHint: "e.g. lab trip" }));
    expect((await listed(dexter)).find((f) => f.id === fundId)?.teamUpdated).toBe(false);
  });
});

describe("Fund fields", () => {
  it("Fund fields: the creator edits name, mail, notes, form template, file-name pattern, claim-name pattern and hint, and archives it", async () => {
    const mickey = claimant();
    const fundId = await created(mickey);
    const fields = {
      name: "Robotics meet",
      mail: { to: ["meets@toontown.example.org"], cc: ["office@toontown.example.org"], subject: "Meet {claim_name}", body: "{total} for {bill_count} bills" },
      notes: "File within a week",
      formTemplate: "meet-form.docx",
      fileNamePattern: "{person} {what}",
      claimNamePattern: "Meet{n}",
      whatForHint: "e.g. arena fee",
    };
    ok(await books.execute(mickey, { type: "EditFund", fundId, ...fields }));
    const { mail: m, formTemplate, fileNamePattern, whatForHint } = fields;
    expect((await listed(mickey)).find((f) => f.id === fundId)).toMatchObject({
      name: "Robotics meet",
      notes: "File within a week",
      claimNamePattern: "Meet{n}",
      teamVersion: { mail: m, formTemplate, fileNamePattern, whatForHint },
    });
    expect(ok(await books.execute(mickey, { type: "ArchiveFund", fundId })).events).toEqual([{ type: "FundArchived", fundId }]);
    expect((await listed(mickey)).find((f) => f.id === fundId)?.archived).toBe(true);
    expect(await books.execute(mickey, { type: "ArchiveFund", fundId })).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("refuses a Fund with no name, or a mail that is not To, CC, subject and body, by every path", async () => {
    const mickey = claimant();
    const fundId = await created(mickey);
    ok(await books.execute(mickey, { type: "ShareFund", fundId }));
    const badMail = { to: "grants@toontown.example.org", cc: [], subject: "", body: "" } as never;
    expect(await books.execute(mickey, travelGrant({ name: "  " }))).toEqual({ ok: false, reason: "validation", field: "name" });
    expect(await books.execute(mickey, travelGrant({ mail: badMail }))).toEqual({ ok: false, reason: "validation", field: "mail" });
    expect(await books.execute(mickey, { type: "EditFund", fundId, name: "" })).toEqual({ ok: false, reason: "validation", field: "name" });
    expect(await books.execute(mickey, { type: "EditFund", fundId, mail: badMail })).toEqual({ ok: false, reason: "validation", field: "mail" });
    expect(await books.execute(mickey, { type: "SetPersonalVersion", fundId, mail: badMail })).toEqual({ ok: false, reason: "validation", field: "mail" });
  });

  it("Notes stay inside Dues: what a Claim is made from carries no notes, from the team version or anyone's own", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const fundId = await created(mickey, { notes: "NOTE-ONLY-FOR-DUES" });
    ok(await books.execute(mickey, { type: "ShareFund", fundId }));
    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId, whatForHint: "e.g. bus" }));
    for (const actor of [mickey, dexter]) {
      const read = await books.fundTemplates(actor, fundId);
      if (!read.ok) throw new Error("expected templates");
      expect(Object.keys(read.templates).sort()).toEqual(["claimNamePattern", "fileNamePattern", "formTemplate", "mail"]);
      expect(JSON.stringify(read)).not.toContain("NOTE-ONLY-FOR-DUES");
    }
  });
});

describe("Funds on the upload prompt", () => {
  const offered = async (actor: Actor, ids: string[]) => {
    const read = await books.promptFunds(actor);
    if (!read.ok) throw new Error("expected prompt");
    return only(ids, read.funds);
  };

  it("Default order: a Claimant who has not ordered their Funds gets Makerspace first, then their Funds oldest first", async () => {
    const mickey = claimant();
    const [first, second] = [await created(mickey, { name: "Travel grant" }), await created(mickey, { name: "Robotics club" })];
    const read = await books.promptFunds(mickey);
    if (!read.ok) throw new Error("expected prompt");
    expect(read.funds[0]?.id).toBe(MAKERSPACE);
    expect(only([MAKERSPACE, first, second], read.funds)).toEqual([MAKERSPACE, first, second]);
  });

  it("Own order: moving Travel grant above Makerspace changes this Claimant's prompt and Settings only", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const travel = await created(mickey);
    ok(await books.execute(mickey, { type: "ShareFund", fundId: travel }));
    ok(await books.execute(mickey, { type: "OrderFunds", fundIds: [travel, MAKERSPACE] }));

    expect(await offered(mickey, [travel, MAKERSPACE])).toEqual([travel, MAKERSPACE]);
    expect(only([travel, MAKERSPACE], await listed(mickey))).toEqual([travel, MAKERSPACE]);
    expect(await offered(dexter, [travel, MAKERSPACE])).toEqual([MAKERSPACE, travel]);
    expect((await auditOf(mickey.claimantId))[0]).toMatchObject({ event: "FundsOrdered", entity: "fund_order", ownerId: mickey.claimantId });
  });

  it("ordering a Fund the Claimant cannot see is not_found, and naming one twice is refused", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const secret = await created(dexter);
    expect(await books.execute(mickey, { type: "OrderFunds", fundIds: [secret, MAKERSPACE] })).toEqual({ ok: false, reason: "not_found" });
    expect(await books.execute(mickey, { type: "OrderFunds", fundIds: [MAKERSPACE, MAKERSPACE] })).toEqual({ ok: false, reason: "validation", field: "fundIds" });
  });

  it("Hidden Fund: a hidden Fund is not offered on that Claimant's prompt, other Claimants still see it, and it can be shown again", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const travel = await created(mickey);
    ok(await books.execute(mickey, { type: "ShareFund", fundId: travel }));
    ok(await books.execute(mickey, { type: "HideFund", fundId: travel, hidden: true }));

    expect(await offered(mickey, [travel])).toEqual([]);
    expect((await listed(mickey)).find((f) => f.id === travel)?.hidden).toBe(true); // still in Settings
    expect(await offered(dexter, [travel])).toEqual([travel]);
    ok(await books.execute(mickey, { type: "HideFund", fundId: travel, hidden: false }));
    expect(await offered(mickey, [travel])).toEqual([travel]);
  });

  it("Archive: an archived Fund is no longer offered on anyone's prompt and stays in Settings", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const travel = await created(mickey);
    ok(await books.execute(mickey, { type: "ShareFund", fundId: travel }));
    ok(await books.execute(mickey, { type: "ArchiveFund", fundId: travel }));
    expect(await offered(mickey, [travel])).toEqual([]);
    expect(await offered(dexter, [travel])).toEqual([]);
    expect((await listed(dexter)).find((f) => f.id === travel)).toMatchObject({ archived: true });
  });

  it("Hint: the prompt carries the Fund's What for? hint, the Claimant's own when they made one", async () => {
    const [mickey, dexter] = [claimant(), claimant()];
    const travel = await created(mickey, { whatForHint: "e.g. soldering supplies" });
    ok(await books.execute(mickey, { type: "ShareFund", fundId: travel }));
    ok(await books.execute(dexter, { type: "SetPersonalVersion", fundId: travel, whatForHint: "e.g. bus fare" }));
    const hint = async (actor: Actor) => {
      const read = await books.promptFunds(actor);
      return read.ok ? read.funds.find((f) => f.id === travel) : undefined;
    };
    expect(await hint(mickey)).toEqual({ id: travel, name: "Travel grant", whatForHint: "e.g. soldering supplies" });
    expect(await hint(dexter)).toEqual({ id: travel, name: "Travel grant", whatForHint: "e.g. bus fare" });
  });
});

describe("Fund access, Actor by Fund state", () => {
  type Who = "creator" | "other" | "admin";
  type State = "private" | "team" | "archived" | "makerspace";
  const N = { ok: true } as const;
  const nf = { ok: false, reason: "not_found" } as const;
  const no = { ok: false, reason: "forbidden" } as const;
  const iv = { ok: false, reason: "invalid_transition" } as const;
  type Outcome = typeof N | typeof nf | typeof no | typeof iv;
  // Hand-typed from identity-access "Fund sharing and edit rights" and design D6. Reset runs after the Actor's own
  // SetPersonalVersion, so it resets that. "archived" is a team Fund, archived. Makerspace is the seeded team Fund with
  // no creator: only an admin edits or archives it.
  const expected: Record<string, Record<State, Partial<Record<Who, Outcome>>>> = {
    EditFund: { private: { creator: N, other: nf, admin: N }, team: { creator: N, other: no, admin: N }, archived: { creator: N, other: no, admin: N }, makerspace: { other: no, admin: N } },
    ShareFund: { private: { creator: N, other: nf, admin: N }, team: { creator: iv, other: no, admin: iv }, archived: { creator: iv, other: no, admin: iv }, makerspace: { other: no, admin: iv } },
    ArchiveFund: { private: { creator: N, other: nf, admin: N }, team: { creator: N, other: no, admin: N }, archived: { creator: iv, other: no, admin: iv }, makerspace: { other: no, admin: N } },
    SetPersonalVersion: { private: { creator: iv, other: nf, admin: iv }, team: { creator: N, other: N, admin: N }, archived: { creator: N, other: N, admin: N }, makerspace: { other: N, admin: N } },
    ResetToTeamVersion: { private: { creator: iv, other: nf, admin: iv }, team: { creator: N, other: N, admin: N }, archived: { creator: N, other: N, admin: N }, makerspace: { other: N, admin: N } },
    HideFund: { private: { creator: N, other: nf, admin: N }, team: { creator: N, other: N, admin: N }, archived: { creator: N, other: N, admin: N }, makerspace: { other: N, admin: N } },
    OrderFunds: { private: { creator: N, other: nf, admin: N }, team: { creator: N, other: N, admin: N }, archived: { creator: N, other: N, admin: N }, makerspace: { other: N, admin: N } },
    fundTemplates: { private: { creator: N, other: nf, admin: N }, team: { creator: N, other: N, admin: N }, archived: { creator: N, other: N, admin: N }, makerspace: { other: N, admin: N } },
  };
  const PER_CLAIMANT = ["SetPersonalVersion", "ResetToTeamVersion", "HideFund", "OrderFunds", "fundTemplates"];

  const cell = async ({ op, state, who }: { op: string; state: State; who: Who }) => {
    const [creator, other, minnie, courage] = [claimant(), claimant(), admin(), claimant()];
    const fundId = state === "makerspace" ? MAKERSPACE : await created(creator);
    if (state === "team" || state === "archived") ok(await books.execute(creator, { type: "ShareFund", fundId }));
    if (state === "archived") ok(await books.execute(creator, { type: "ArchiveFund", fundId }));
    const actor = { creator, other, admin: minnie }[who];
    // Who owns a change to the Fund: its creator, or the acting admin for Makerspace, which has none.
    const owner = state === "makerspace" ? actor : creator;
    if (op === "ResetToTeamVersion" && state !== "private") ok(await books.execute(actor, { type: "SetPersonalVersion", fundId, fileNamePattern: "{n}" }));
    const bystander = async () => [(await listed(courage)).find((f) => f.id === fundId), await books.fundTemplates(courage, fundId)];
    const [seen, rows] = [await bystander(), (await auditOf(fundId)).length];

    const result =
      op === "fundTemplates"
        ? await books.fundTemplates(actor, fundId)
        : await books.execute(
            actor,
            op === "EditFund" ? { type: op, fundId, name: "Renamed" }
            : op === "SetPersonalVersion" ? { type: op, fundId, whatForHint: "e.g. mine" }
            : op === "HideFund" ? { type: op, fundId, hidden: true }
            : op === "OrderFunds" ? { type: op, fundIds: [fundId] }
            : { type: op as "ShareFund" | "ArchiveFund" | "ResetToTeamVersion", fundId },
          );
    const want = expected[op]![state][who]!;
    const label = `${op} on a ${state} Fund by ${who}`;
    expect(want.ok ? { ok: result.ok } : result, label).toEqual(want);
    if (!want.ok || PER_CLAIMANT.includes(op)) expect(await bystander(), label).toEqual(seen);
    if (!want.ok) expect((await auditOf(fundId)).length, label).toBe(rows);
    if (result.ok && ["EditFund", "ShareFund", "ArchiveFund"].includes(op))
      expect((await auditOf(fundId)).at(-1), label).toMatchObject({ actorId: actor.claimantId, ownerId: owner.claimantId, command: op });
    if (!want.ok) return;
    // A cell that succeeds also did what it says, seen through the Actor's own Settings or templates.
    const mine = await listed(actor);
    const changed: Record<string, unknown> = {
      EditFund: { name: "Renamed" },
      ShareFund: { sharing: "team" },
      ArchiveFund: { archived: true },
      SetPersonalVersion: { myVersion: { whatForHint: "e.g. mine" } },
      ResetToTeamVersion: { myVersion: null },
      HideFund: { hidden: true },
    };
    if (op === "fundTemplates") expect(result, label).toMatchObject({ templates: { claimNamePattern: state === "makerspace" ? "{Month}{n}" : "Travel{n}" } });
    else if (op === "OrderFunds") expect(mine[0]?.id, label).toBe(fundId);
    else expect(mine.find((f) => f.id === fundId), label).toMatchObject(changed[op]!);
  };
  const cellsOf = (states: State[]) =>
    Object.entries(expected).flatMap(([op, byState]) =>
      states.flatMap((state) => (Object.keys(byState[state]) as Who[]).map((who) => ({ op, state, who }))),
    );

  it("table: what creator, another Claimant and an admin may do to a private, team and archived Fund; a refusal or a per-Claimant command never changes what a bystander sees", async () => {
    await Promise.all(cellsOf(["private", "team", "archived"]).map(cell));
  }, 60_000);

  it("table: Makerspace, which has no creator: a non-admin may not edit or archive it; an admin's change is audited with the admin as actor and owner", async () => {
    // One at a time: every cell acts on the one Makerspace row, put back after each.
    for (const c of cellsOf(["makerspace"]))
      try {
        await cell(c);
      } finally {
        await resetMakerspace();
      }
  }, 60_000);
});

describe("Fund commands in Books' shell", () => {
  it("a role-less Actor is forbidden from every Fund command and query", async () => {
    const roleless: Actor = { claimantId: randomUUID(), roles: ["admin"], via: "session" };
    expect(await books.execute(roleless, travelGrant())).toEqual({ ok: false, reason: "forbidden" });
    expect(await books.execute(roleless, { type: "EditFund", fundId: MAKERSPACE, name: "x" })).toEqual({ ok: false, reason: "forbidden" });
    expect(await books.funds(roleless)).toEqual({ ok: false, reason: "forbidden" });
    expect(await books.promptFunds(roleless)).toEqual({ ok: false, reason: "forbidden" });
    expect(await books.fundTemplates(roleless, MAKERSPACE)).toEqual({ ok: false, reason: "forbidden" });
  });

  it("a repeated idempotency key returns the first result and creates one Fund", async () => {
    const mickey = claimant();
    const key = `fund-${randomUUID()}`;
    const [first, again] = [await books.execute(mickey, travelGrant(), { idempotencyKey: key }), await books.execute(mickey, travelGrant(), { idempotencyKey: key })];
    expect(again).toEqual(first);
    const made = await db.select().from(auditLog).where(eq(auditLog.actorId, mickey.claimantId));
    expect(made.map((e) => e.event)).toEqual(["FundCreated"]);
    expect(await books.execute(mickey, travelGrant({ name: "Other" }), { idempotencyKey: key })).toEqual({ ok: false, reason: "idempotency_conflict" });
  });

  it("the creator's and an admin's edits at once queue on the creator's lock: both land and the team version counts both", async () => {
    const [mickey, minnie] = [claimant(), admin()];
    const fundId = await created(mickey);
    ok(await books.execute(mickey, { type: "ShareFund", fundId }));
    await Promise.all([
      books.execute(mickey, { type: "EditFund", fundId, fileNamePattern: "{n} a" }),
      books.execute(minnie, { type: "EditFund", fundId, whatForHint: "e.g. b" }),
    ]);
    const edits = (await auditOf(fundId)).filter((e) => e.event === "FundEdited").map((e) => (e.payload as { teamVersion: number }).teamVersion);
    expect(edits.sort()).toEqual([2, 3]);
    expect((await listed(mickey)).find((f) => f.id === fundId)?.teamVersion).toMatchObject({ fileNamePattern: "{n} a", whatForHint: "e.g. b" });
  });

  it("two admins editing Makerspace at once queue up: both edits land and the team version counts both", async () => {
    const [minnie, daisy] = [admin(), admin()];
    try {
      await Promise.all([
        books.execute(minnie, { type: "EditFund", fundId: MAKERSPACE, fileNamePattern: "{n} a" }),
        books.execute(daisy, { type: "EditFund", fundId: MAKERSPACE, whatForHint: "e.g. b" }),
      ]);
      const edits = (await auditOf(MAKERSPACE))
        .filter((e) => e.event === "FundEdited" && [minnie.claimantId, daisy.claimantId].includes(e.actorId))
        .map((e) => (e.payload as { teamVersion: number }).teamVersion)
        .sort((a, b) => a - b);
      expect(edits).toHaveLength(2);
      expect(edits[1]).toBe(edits[0]! + 1);
      expect((await listed(minnie)).find((f) => f.id === MAKERSPACE)?.teamVersion).toMatchObject({ fileNamePattern: "{n} a", whatForHint: "e.g. b" });
    } finally {
      await resetMakerspace();
    }
  });

  it("a Claimant's own order, hiding and version share Makerspace's row with others in flight; an admin's edit waits for them", async () => {
    const [dexter, minnie] = [claimant(), admin()];
    const settled = (p: Promise<unknown>, ms: number) => Promise.race([p.then(() => "done"), new Promise((r) => setTimeout(r, ms, "waiting"))]);
    // Another Claimant's per-Claimant command still open on Makerspace.
    const inFlight = await pool.connect();
    let edit: Promise<Result> | undefined;
    try {
      await inFlight.query("begin");
      await inFlight.query("select 1 from funds where id = $1 for share", [MAKERSPACE]);
      for (const command of [
        { type: "OrderFunds", fundIds: [MAKERSPACE] },
        { type: "HideFund", fundId: MAKERSPACE, hidden: true },
        { type: "SetPersonalVersion", fundId: MAKERSPACE, whatForHint: "e.g. mine" },
        { type: "ResetToTeamVersion", fundId: MAKERSPACE },
      ] as const)
        expect(await settled(books.execute(dexter, command), 2_000), command.type).toBe("done");
      edit = books.execute(minnie, { type: "EditFund", fundId: MAKERSPACE, notes: "Checked by the office" });
      expect(await settled(edit, 300)).toBe("waiting");
    } finally {
      await inFlight.query("commit");
      inFlight.release();
    }
    try {
      expect(await edit).toMatchObject({ ok: true });
    } finally {
      await resetMakerspace();
    }
  });
});
