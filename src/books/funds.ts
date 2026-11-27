// Funds inside Books (design §1 lists the Fund command family there): pure rules first, then the shell's loads, writes
// and reads. Claims, Purposes and the Advance read Funds in Books' transaction, so they live under the same Actor Seam.
import { and, eq, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { funds, fundSettings, fundVersions } from "@/src/db/schema";
import type { Actor } from "./core";

/** Seeded by migration 0007: the one Fund every Claimant has from the start. */
export const MAKERSPACE = "00000000-0000-7000-8000-000000000001";

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
/** An admin signed in by session reaches every Fund by id (design D6); lists still show only their own and team Funds. */
export const isAdmin = (actor: Actor) => actor.via === "session" && actor.roles.includes("admin");
const visible = (actor: Actor) => or(eq(funds.team, true), eq(funds.creatorId, actor.claimantId));

/** Every Fund the Actor can use, their own private ones and every team Fund, in the Actor's order (Settings → Funds). */
export async function listFunds(q: Q, actor: Actor) {
  const rows = await q
    .select({ fund: funds, mine: fundVersions, setting: fundSettings })
    .from(funds)
    .leftJoin(fundVersions, and(eq(fundVersions.fundId, funds.id), eq(fundVersions.claimantId, actor.claimantId)))
    .leftJoin(fundSettings, and(eq(fundSettings.fundId, funds.id), eq(fundSettings.claimantId, actor.claimantId)))
    .where(visible(actor));
  return rows.sort(byOrder).map(({ fund, mine, setting }) => {
    const teamVersion = pick(fund);
    const myVersion = mine && (Object.fromEntries(OVERRIDABLE.flatMap((k) => (mine[k] === null ? [] : [[k, mine[k]]]))) as Partial<Overridable>);
    return {
      id: fund.id,
      name: fund.name,
      notes: fund.notes, // shown to Dues users here; never in fundTemplates
      sharing: fund.team ? ("team" as const) : ("private" as const),
      archived: fund.archived,
      hidden: setting?.hidden ?? false,
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
