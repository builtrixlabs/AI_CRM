import { describe, expect, it } from "vitest";
import {
  claimCoordination,
  releaseCoordination,
  getCoordinatorForDate,
} from "@/lib/sitevisits/coordinator";

const ORG = "11111111-2222-4333-8444-555555555555";
const ORG_B = "99999999-2222-4333-8444-555555555555";
const COORD_A = "aaaaaaaa-2222-4333-8444-555555555555";
const COORD_B = "bbbbbbbb-2222-4333-8444-555555555555";
const DATE = "2026-05-20";

type ClaimRow = {
  organization_id: string;
  coordination_date: string;
  coordinator_id: string;
  claimed_at: string;
};

/**
 * In-memory mock of site_visit_coordinator_claims that honours the
 * composite PK (organization_id, coordination_date): a second insert for
 * the same (org, date) yields a 23505 unique-violation, exactly like PG.
 */
function makeClient(seed: ClaimRow[] = []) {
  const rows: ClaimRow[] = seed.map((r) => ({ ...r }));

  function from(table: string) {
    if (table !== "site_visit_coordinator_claims") {
      throw new Error(`unexpected table ${table}`);
    }
    return {
      insert(row: Omit<ClaimRow, "claimed_at">) {
        const dup = rows.some(
          (r) =>
            r.organization_id === row.organization_id &&
            r.coordination_date === row.coordination_date,
        );
        return {
          select() {
            return {
              maybeSingle() {
                if (dup) {
                  return Promise.resolve({
                    data: null,
                    error: {
                      code: "23505",
                      message: "duplicate key value violates unique constraint",
                    },
                  });
                }
                const full: ClaimRow = {
                  ...row,
                  claimed_at: "2026-05-14T00:00:00.000Z",
                };
                rows.push(full);
                return Promise.resolve({ data: full, error: null });
              },
            };
          },
        };
      },
      select() {
        const filters: Record<string, string> = {};
        const chain = {
          eq(col: string, val: string) {
            filters[col] = val;
            return chain;
          },
          maybeSingle() {
            const found = rows.find(
              (r) =>
                r.organization_id === filters.organization_id &&
                r.coordination_date === filters.coordination_date,
            );
            return Promise.resolve({ data: found ?? null, error: null });
          },
        };
        return chain;
      },
      delete() {
        const filters: Record<string, string> = {};
        const chain = {
          eq(col: string, val: string) {
            filters[col] = val;
            return chain;
          },
          then(onF: (v: { error: null }) => unknown) {
            const idx = rows.findIndex(
              (r) =>
                r.organization_id === filters.organization_id &&
                r.coordination_date === filters.coordination_date,
            );
            if (idx >= 0) rows.splice(idx, 1);
            return Promise.resolve({ error: null }).then(onF);
          },
        };
        return chain;
      },
    };
  }

  return { client: { from }, rows };
}

describe("claimCoordination — atomic per (org, day)", () => {
  it("first claim succeeds", async () => {
    const { client, rows } = makeClient();
    const r = await claimCoordination(
      { organization_id: ORG, coordinator_id: COORD_A, coordination_date: DATE },
      client as never,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.claim.coordinator_id).toBe(COORD_A);
    expect(rows).toHaveLength(1);
  });

  it("second claim for the same (org, day) is rejected as already_claimed", async () => {
    const { client } = makeClient([
      {
        organization_id: ORG,
        coordination_date: DATE,
        coordinator_id: COORD_A,
        claimed_at: "2026-05-14T00:00:00.000Z",
      },
    ]);
    const r = await claimCoordination(
      { organization_id: ORG, coordinator_id: COORD_B, coordination_date: DATE },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "already_claimed") {
      expect(r.coordinator_id).toBe(COORD_A);
    } else {
      throw new Error("expected already_claimed");
    }
  });

  it("a different org can claim the same calendar day independently", async () => {
    const { client, rows } = makeClient([
      {
        organization_id: ORG,
        coordination_date: DATE,
        coordinator_id: COORD_A,
        claimed_at: "2026-05-14T00:00:00.000Z",
      },
    ]);
    const r = await claimCoordination(
      {
        organization_id: ORG_B,
        coordinator_id: COORD_B,
        coordination_date: DATE,
      },
      client as never,
    );
    expect(r.ok).toBe(true);
    expect(rows).toHaveLength(2);
  });
});

describe("releaseCoordination", () => {
  it("the claimant can release their own claim", async () => {
    const { client, rows } = makeClient([
      {
        organization_id: ORG,
        coordination_date: DATE,
        coordinator_id: COORD_A,
        claimed_at: "2026-05-14T00:00:00.000Z",
      },
    ]);
    const r = await releaseCoordination(
      { organization_id: ORG, coordinator_id: COORD_A, coordination_date: DATE },
      client as never,
    );
    expect(r.ok).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("refuses to release another coordinator's claim", async () => {
    const { client, rows } = makeClient([
      {
        organization_id: ORG,
        coordination_date: DATE,
        coordinator_id: COORD_A,
        claimed_at: "2026-05-14T00:00:00.000Z",
      },
    ]);
    const r = await releaseCoordination(
      { organization_id: ORG, coordinator_id: COORD_B, coordination_date: DATE },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_claimant");
    expect(rows).toHaveLength(1);
  });

  it("releasing a non-existent claim is an idempotent no-op success", async () => {
    const { client } = makeClient();
    const r = await releaseCoordination(
      { organization_id: ORG, coordinator_id: COORD_A, coordination_date: DATE },
      client as never,
    );
    expect(r.ok).toBe(true);
  });
});

describe("getCoordinatorForDate", () => {
  it("returns the claim row for a claimed (org, day)", async () => {
    const { client } = makeClient([
      {
        organization_id: ORG,
        coordination_date: DATE,
        coordinator_id: COORD_A,
        claimed_at: "2026-05-14T00:00:00.000Z",
      },
    ]);
    const claim = await getCoordinatorForDate(ORG, DATE, client as never);
    expect(claim?.coordinator_id).toBe(COORD_A);
  });

  it("returns null for an unclaimed (org, day)", async () => {
    const { client } = makeClient();
    const claim = await getCoordinatorForDate(ORG, DATE, client as never);
    expect(claim).toBeNull();
  });

  it("does not leak another org's claim", async () => {
    const { client } = makeClient([
      {
        organization_id: ORG_B,
        coordination_date: DATE,
        coordinator_id: COORD_B,
        claimed_at: "2026-05-14T00:00:00.000Z",
      },
    ]);
    const claim = await getCoordinatorForDate(ORG, DATE, client as never);
    expect(claim).toBeNull();
  });
});
