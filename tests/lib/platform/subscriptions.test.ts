import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  cancelOrg,
  changePlanTier,
  isPlanTier,
  listOrgSubscriptions,
  reactivateOrg,
  suspendOrg,
} from "@/lib/platform/subscriptions";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const ACTOR = "99999999-8888-4777-8666-555555555555";

function makeWriteClient(opts: { update_error?: boolean } = {}) {
  const updates: unknown[] = [];
  const audits: unknown[] = [];
  const revocations: { kind: "upsert" | "delete"; payload: unknown }[] = [];
  const subsChain = {
    update: vi.fn((row: unknown) => {
      updates.push(row);
      return Object.assign(subsChain, {
        eq: vi.fn(() =>
          Promise.resolve({
            error: opts.update_error ? new Error("db") : null,
          })
        ),
      });
    }),
  };
  return {
    updates,
    audits,
    revocations,
    client: {
      from: vi.fn((table: string) => {
        if (table === "subscriptions") return subsChain;
        if (table === "audit_log") {
          return {
            insert: vi.fn((row: unknown) => {
              audits.push(row);
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === "org_session_revocations") {
          return {
            upsert: vi.fn((row: unknown) => {
              revocations.push({ kind: "upsert", payload: row });
              return Promise.resolve({ error: null });
            }),
            delete: vi.fn(() => ({
              eq: vi.fn((_col: string, val: unknown) => {
                revocations.push({ kind: "delete", payload: val });
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        throw new Error(`unexpected ${table}`);
      }),
    },
  };
}

beforeEach(() => {
  // no-op
});

describe("isPlanTier", () => {
  it("accepts the four valid tiers", () => {
    for (const t of ["starter", "professional", "enterprise", "custom"]) {
      expect(isPlanTier(t)).toBe(true);
    }
  });
  it("rejects garbage", () => {
    expect(isPlanTier("free")).toBe(false);
    expect(isPlanTier(null)).toBe(false);
    expect(isPlanTier(42)).toBe(false);
  });
});

describe("listOrgSubscriptions", () => {
  it("joins orgs with subscription rows; defaults missing rows to starter/active", async () => {
    const orgsChain = {
      select: vi.fn(() => orgsChain),
      is: vi.fn(() => orgsChain),
      order: vi.fn(() =>
        Promise.resolve({
          data: [
            { id: ORG_A, slug: "alpha", name: "Alpha" },
            { id: ORG_B, slug: "bravo", name: "Bravo" },
          ],
          error: null,
        })
      ),
    };
    const subsChain = {
      select: vi.fn(() => subsChain),
      is: vi.fn(() =>
        Promise.resolve({
          data: [
            {
              organization_id: ORG_A,
              plan_tier: "professional",
              status: "active",
              starts_at: "2026-01-01T00:00:00Z",
              current_period_end: null,
            },
          ],
          error: null,
        })
      ),
    };
    const client = {
      from: vi.fn((table: string) => {
        if (table === "organizations") return orgsChain;
        if (table === "subscriptions") return subsChain;
        throw new Error(`unexpected ${table}`);
      }),
    };

    const rows = await listOrgSubscriptions(client as never);
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.organization_id === ORG_A)!;
    expect(a.plan_tier).toBe("professional");
    expect(a.status).toBe("active");
    const b = rows.find((r) => r.organization_id === ORG_B)!;
    expect(b.plan_tier).toBe("starter"); // default
    expect(b.status).toBe("active");
  });
});

describe("changePlanTier", () => {
  it("updates row + writes audit when tier valid", async () => {
    const env = makeWriteClient();
    const r = await changePlanTier(
      { actor_id: ACTOR, organization_id: ORG_A },
      "enterprise",
      env.client as never
    );
    expect(r.ok).toBe(true);
    expect(env.updates[0]).toMatchObject({ plan_tier: "enterprise" });
    expect(env.audits).toHaveLength(1);
    expect((env.audits[0] as { action: string }).action).toBe(
      "plan_tier_changed"
    );
  });

  it("rejects invalid tier", async () => {
    const env = makeWriteClient();
    const r = await changePlanTier(
      { actor_id: ACTOR, organization_id: ORG_A },
      "free" as never,
      env.client as never
    );
    expect(r.ok).toBe(false);
    expect(env.audits).toHaveLength(0);
  });
});

describe("suspendOrg", () => {
  it("requires non-trivial reason", async () => {
    const env = makeWriteClient();
    const r = await suspendOrg(
      { actor_id: ACTOR, organization_id: ORG_A },
      "",
      env.client as never
    );
    expect(r.ok).toBe(false);
    expect(env.audits).toHaveLength(0);
  });

  it("sets status=suspended + audits when reason valid", async () => {
    const env = makeWriteClient();
    const r = await suspendOrg(
      { actor_id: ACTOR, organization_id: ORG_A },
      "Non-payment Q1",
      env.client as never
    );
    expect(r.ok).toBe(true);
    expect(env.updates[0]).toMatchObject({ status: "suspended" });
    expect((env.audits[0] as { action: string }).action).toBe(
      "subscription_suspended"
    );
  });

  it("D-302 — also UPSERTs an org_session_revocations row", async () => {
    const env = makeWriteClient();
    await suspendOrg(
      { actor_id: ACTOR, organization_id: ORG_A },
      "Non-payment Q1",
      env.client as never
    );
    expect(env.revocations).toHaveLength(1);
    expect(env.revocations[0].kind).toBe("upsert");
    const payload = env.revocations[0].payload as {
      organization_id: string;
      revoked_by: string;
      reason: string;
    };
    expect(payload.organization_id).toBe(ORG_A);
    expect(payload.revoked_by).toBe(ACTOR);
    expect(payload.reason).toBe("Non-payment Q1");
  });

  it("propagates db errors", async () => {
    const env = makeWriteClient({ update_error: true });
    const r = await suspendOrg(
      { actor_id: ACTOR, organization_id: ORG_A },
      "Reason xxx",
      env.client as never
    );
    expect(r.ok).toBe(false);
  });
});

describe("cancelOrg", () => {
  it("sets status=cancelled with grace period_end", async () => {
    const env = makeWriteClient();
    const r = await cancelOrg(
      { actor_id: ACTOR, organization_id: ORG_A },
      "Customer request",
      30,
      env.client as never
    );
    expect(r.ok).toBe(true);
    const update = env.updates[0] as Record<string, unknown>;
    expect(update.status).toBe("cancelled");
    expect(typeof update.current_period_end).toBe("string");
    expect((env.audits[0] as { action: string }).action).toBe(
      "subscription_cancelled"
    );
  });
});

describe("reactivateOrg", () => {
  it("flips status back to active and clears period_end", async () => {
    const env = makeWriteClient();
    const r = await reactivateOrg(
      { actor_id: ACTOR, organization_id: ORG_A },
      env.client as never
    );
    expect(r.ok).toBe(true);
    const update = env.updates[0] as Record<string, unknown>;
    expect(update.status).toBe("active");
    expect(update.current_period_end).toBeNull();
    expect((env.audits[0] as { action: string }).action).toBe(
      "subscription_reactivated"
    );
  });

  it("D-302 — also DELETEs the org_session_revocations row (idempotent)", async () => {
    const env = makeWriteClient();
    await reactivateOrg(
      { actor_id: ACTOR, organization_id: ORG_A },
      env.client as never
    );
    expect(env.revocations).toHaveLength(1);
    expect(env.revocations[0].kind).toBe("delete");
    expect(env.revocations[0].payload).toBe(ORG_A);
  });
});
