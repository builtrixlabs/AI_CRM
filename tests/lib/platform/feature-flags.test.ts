import { describe, expect, it, vi } from "vitest";
import {
  deleteOrgFeatureFlag,
  getOrgFeatureFlags,
  isFeatureEnabled,
  setOrgFeatureFlag,
} from "@/lib/platform/feature-flags";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeReadClient(feature_flags: unknown) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: feature_flags === undefined ? null : { feature_flags },
        error: null,
      }),
    ),
  };
  return { from: vi.fn(() => chain) };
}

function makeUpdateClient(opts: {
  read: unknown;
  update_rows: Array<{ id: string }>;
}) {
  const reads: unknown[] = [];
  const updates: unknown[] = [];
  let call = 0;
  const readChain: Record<string, unknown> = {
    select: vi.fn(() => readChain),
    eq: vi.fn(() => readChain),
    maybeSingle: vi.fn(() => {
      reads.push("read");
      return Promise.resolve({
        data: opts.read === undefined ? null : { feature_flags: opts.read },
        error: null,
      });
    }),
  };
  const writeChain: Record<string, unknown> = {
    update: vi.fn((patch: unknown) => {
      updates.push(patch);
      return writeChain;
    }),
    eq: vi.fn(() => writeChain),
    select: vi.fn(() =>
      Promise.resolve({ data: opts.update_rows, error: null }),
    ),
  };
  return {
    reads,
    updates,
    client: {
      from: vi.fn(() => {
        call += 1;
        return call === 1 ? readChain : writeChain;
      }),
    },
  };
}

describe("getOrgFeatureFlags", () => {
  it("returns the jsonb when present + object-shaped", async () => {
    const client = makeReadClient({ recovery_team_enabled: true, label: "x" });
    const ff = await getOrgFeatureFlags(ORG, client as never);
    expect(ff).toEqual({ recovery_team_enabled: true, label: "x" });
  });

  it("returns {} when org missing", async () => {
    const client = makeReadClient(undefined);
    const ff = await getOrgFeatureFlags(ORG, client as never);
    expect(ff).toEqual({});
  });

  it("coerces non-object jsonb to {}", async () => {
    const c1 = makeReadClient(null);
    expect(await getOrgFeatureFlags(ORG, c1 as never)).toEqual({});
    const c2 = makeReadClient([1, 2, 3]);
    expect(await getOrgFeatureFlags(ORG, c2 as never)).toEqual({});
  });
});

describe("isFeatureEnabled", () => {
  it("returns true only when stored value is === true", async () => {
    const t = makeReadClient({ ff: true });
    expect(await isFeatureEnabled(ORG, "ff", false, t as never)).toBe(true);
    const f = makeReadClient({ ff: false });
    expect(await isFeatureEnabled(ORG, "ff", true, f as never)).toBe(false);
  });

  it("falls back to default for missing / non-boolean values", async () => {
    const miss = makeReadClient({});
    expect(await isFeatureEnabled(ORG, "ff", true, miss as never)).toBe(true);
    expect(await isFeatureEnabled(ORG, "ff", false, miss as never)).toBe(false);
    const str = makeReadClient({ ff: "yes" });
    expect(await isFeatureEnabled(ORG, "ff", false, str as never)).toBe(false);
  });
});

describe("setOrgFeatureFlag", () => {
  it("merges into the existing jsonb + returns ok", async () => {
    const env = makeUpdateClient({
      read: { other: true },
      update_rows: [{ id: ORG }],
    });
    const r = await setOrgFeatureFlag({
      organization_id: ORG,
      flag: "recovery_team_enabled",
      value: true,
      client: env.client as never,
    });
    expect(r).toEqual({ ok: true });
    const patch = env.updates[0] as { feature_flags: Record<string, unknown> };
    expect(patch.feature_flags).toEqual({
      other: true,
      recovery_team_enabled: true,
    });
  });

  it("returns 'not_found' when no row updated", async () => {
    const env = makeUpdateClient({ read: {}, update_rows: [] });
    const r = await setOrgFeatureFlag({
      organization_id: ORG,
      flag: "x",
      value: true,
      client: env.client as never,
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("deleteOrgFeatureFlag", () => {
  it("is a no-op when the flag is not present", async () => {
    const env = makeUpdateClient({ read: {}, update_rows: [] });
    const r = await deleteOrgFeatureFlag({
      organization_id: ORG,
      flag: "missing",
      client: env.client as never,
    });
    expect(r).toEqual({ ok: true });
    expect(env.updates).toHaveLength(0);
  });

  it("removes the key and writes the rest back", async () => {
    const env = makeUpdateClient({
      read: { ff: true, keep: 1 },
      update_rows: [{ id: ORG }],
    });
    const r = await deleteOrgFeatureFlag({
      organization_id: ORG,
      flag: "ff",
      client: env.client as never,
    });
    expect(r).toEqual({ ok: true });
    const patch = env.updates[0] as { feature_flags: Record<string, unknown> };
    expect(patch.feature_flags).toEqual({ keep: 1 });
  });
});
