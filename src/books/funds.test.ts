import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "@/src/db/index";
import { auditLog } from "@/src/db/schema";
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

  it("an admin reaches another Claimant's private Fund by id and edits it, audited as actor, while their list holds only their own and team Funds", async () => {
    const [mickey, minnie] = [claimant(), admin()];
    const fundId = await created(mickey);
    expect((await listed(minnie)).map((f) => f.id)).not.toContain(fundId);
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
