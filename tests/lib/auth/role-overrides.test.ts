import { describe, expect, it, vi } from "vitest";
import {
  clearOverride,
  effectiveStateFor,
  listOverrides,
  setOverride,
} from "@/lib/auth/role-overrides";

const ORG = "11111111-2222-4333-8444-555555555555";
const ACTOR = "99999999-8888-4777-8666-555555555555";

function makeWriteClient(opts: { insert_error?: boolean } = {}) {
  const inserts: unknown[] = [];
  const audits: unknown[] = [];
  const updates: unknown[] = [];
  const overridesChain = {
    select: vi.fn(() => overridesChain),
    eq: vi.fn(() => overridesChain),
    is: vi.fn(() => overridesChain),
    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    insert: vi.fn((row: unknown) => {
      inserts.push(row);
      return Promise.resolve({
        error: opts.insert_error ? new Error("db") : null,
      });
    }),
    update: vi.fn((row: unknown) => {
      updates.push(row);
      return Object.assign(overridesChain, {
        eq: vi.fn(() => overridesChain),
        is: vi.fn(() => Promise.resolve({ error: null })),
      });
    }),
  };
  const auditChain = {
    insert: vi.fn((row: unknown) => {
      audits.push(row);
      return Promise.resolve({ error: null });
    }),
  };
  return {
    inserts,
    audits,
    updates,
    client: {
      from: vi.fn((t: string) => {
        if (t === "role_permission_overrides") return overridesChain;
        if (t === "audit_log") return auditChain;
        throw new Error(`unexpected ${t}`);
      }),
    },
  };
}

describe("setOverride", () => {
  it("inserts row + audits when valid allow with reason", async () => {
    const env = makeWriteClient();
    const r = await setOverride(
      {
        organization_id: ORG,
        role: "manager",
        permission: "leads:export",
        mode: "allow",
        reason: "Trial-feature requested by customer",
        actor_id: ACTOR,
      },
      env.client as never
    );
    expect(r.ok).toBe(true);
    expect(env.inserts).toHaveLength(1);
    expect((env.inserts[0] as { mode: string }).mode).toBe("allow");
    expect((env.audits[0] as { action: string }).action).toBe(
      "role_permission_override_set"
    );
  });

  it("rejects platform-only allow on non-super role", async () => {
    const env = makeWriteClient();
    const r = await setOverride(
      {
        organization_id: ORG,
        role: "manager",
        permission: "platform:manage",
        mode: "allow",
        reason: "Trying to elevate",
        actor_id: ACTOR,
      },
      env.client as never
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("platform_only_permission");
    expect(env.inserts).toHaveLength(0);
  });

  it("requires reason ≥ 3 chars", async () => {
    const env = makeWriteClient();
    const r = await setOverride(
      {
        organization_id: ORG,
        role: "manager",
        permission: "leads:export",
        mode: "deny",
        reason: " ",
        actor_id: ACTOR,
      },
      env.client as never
    );
    expect(r.ok).toBe(false);
    expect(env.inserts).toHaveLength(0);
  });

  it("rejects invalid role / permission", async () => {
    const env = makeWriteClient();
    const r1 = await setOverride(
      {
        organization_id: ORG,
        role: "super_admin" as never, // not in GRANTABLE_APP_ROLES
        permission: "leads:export",
        mode: "allow",
        reason: "x",
        actor_id: ACTOR,
      },
      env.client as never
    );
    expect(r1.ok).toBe(false);

    const r2 = await setOverride(
      {
        organization_id: ORG,
        role: "manager",
        permission: "fake:permission" as never,
        mode: "allow",
        reason: "x",
        actor_id: ACTOR,
      },
      env.client as never
    );
    expect(r2.ok).toBe(false);
  });
});

describe("clearOverride", () => {
  it("soft-deletes + audits", async () => {
    const env = makeWriteClient();
    const r = await clearOverride(
      {
        organization_id: ORG,
        role: "manager",
        permission: "leads:export",
        actor_id: ACTOR,
      },
      env.client as never
    );
    expect(r.ok).toBe(true);
    expect(env.audits).toHaveLength(1);
    expect((env.audits[0] as { action: string }).action).toBe(
      "role_permission_override_cleared"
    );
  });
});

describe("listOverrides", () => {
  it("returns latest-wins per (role, permission)", async () => {
    const rows = [
      {
        id: "x1",
        organization_id: ORG,
        role: "manager",
        permission: "leads:export",
        mode: "deny",
        reason: "newer",
        created_at: "2026-05-09T00:00:00Z",
      },
      {
        id: "x2",
        organization_id: ORG,
        role: "manager",
        permission: "leads:export",
        mode: "allow",
        reason: "older",
        created_at: "2026-05-08T00:00:00Z",
      },
    ];
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    };
    const client = { from: vi.fn(() => chain) };
    const out = await listOverrides(ORG, client as never);
    expect(out).toHaveLength(1);
    expect(out[0].mode).toBe("deny"); // latest wins
  });
});

describe("effectiveStateFor", () => {
  it("default-granted role with no override stays granted", () => {
    const s = effectiveStateFor("manager", "leads:view", null);
    expect(s.granted).toBe(true);
    expect(s.default_granted).toBe(true);
    expect(s.override).toBeNull();
  });

  it("default-denied role with allow override flips to granted", () => {
    const s = effectiveStateFor("read_only", "leads:export", "allow");
    expect(s.granted).toBe(true);
    expect(s.default_granted).toBe(false);
  });

  it("default-granted role with deny override flips to denied", () => {
    const s = effectiveStateFor("manager", "leads:view", "deny");
    expect(s.granted).toBe(false);
  });

  it("platform-only stays denied even on allow override", () => {
    const s = effectiveStateFor("manager", "platform:manage", "allow");
    expect(s.platform_only).toBe(true);
    expect(s.granted).toBe(false);
  });
});
