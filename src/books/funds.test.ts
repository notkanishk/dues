import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/src/db/index";
import { createBooks } from "./books";
import type { Actor } from "./core";
import { MAKERSPACE } from "./funds";

// Fund scenarios through Books' Interface against a real Postgres (DATABASE_URL): claims "Funds define how a Claim is
// made", identity-access "Fund sharing and edit rights", expense-tracking "Funds on the upload prompt".
// Every test uses fresh Claimants; Makerspace is the one Fund they all share.

const NOW = new Date("2026-11-27T10:00:00.000Z");
const books = createBooks({ db, now: () => NOW, enqueue: async () => {} });
const claimant = (): Actor => ({ claimantId: randomUUID(), roles: ["claimant"], via: "session" });

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
