import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  upsertSecret: vi.fn(),
  invalidateSecretCache: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/secrets/queries", () => ({
  upsertSecret: mocks.upsertSecret,
}));
vi.mock("@/lib/secrets/getSecret", () => ({
  invalidateSecretCache: mocks.invalidateSecretCache,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { setSecretAction } from "@/app/(platform)/platform/settings/secrets/actions";

const SUPER_ADMIN = {
  user: { id: "uuid-1", email: "x@y" },
  profile: { id: "uuid-1", display_name: "x", base_role: "super_admin" },
  org_id: null,
  workspace_ids: [],
  app_roles: [],
};

const SALES_REP = {
  ...SUPER_ADMIN,
  profile: { ...SUPER_ADMIN.profile, base_role: "sales_rep" },
};

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.upsertSecret.mockReset();
  mocks.invalidateSecretCache.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.upsertSecret.mockResolvedValue(undefined);
});

function fd(kind: string, value: string): FormData {
  const f = new FormData();
  f.set("kind", kind);
  f.set("value", value);
  return f;
}

describe("setSecretAction", () => {
  it("rejects unauthenticated callers", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const r = await setSecretAction(fd("anthropic_api_key", "validvalue123"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("permission");
    expect(mocks.upsertSecret).not.toHaveBeenCalled();
  });

  it("rejects non-super_admin callers (sales_rep)", async () => {
    mocks.getCurrentUser.mockResolvedValue(SALES_REP);
    const r = await setSecretAction(fd("anthropic_api_key", "validvalue123"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("permission");
    expect(mocks.upsertSecret).not.toHaveBeenCalled();
  });

  it("rejects unknown secret kinds", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPER_ADMIN);
    const r = await setSecretAction(fd("not_a_kind", "validvalue123"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("validation");
  });

  it("rejects too-short values", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPER_ADMIN);
    const r = await setSecretAction(fd("anthropic_api_key", "short"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("validation");
    expect(mocks.upsertSecret).not.toHaveBeenCalled();
  });

  it("upserts the secret + invalidates cache + revalidates the page on success", async () => {
    mocks.getCurrentUser.mockResolvedValue(SUPER_ADMIN);
    const r = await setSecretAction(
      fd("anthropic_api_key", "sk-ant-api01-realvalue")
    );
    expect(r.ok).toBe(true);
    expect(mocks.upsertSecret).toHaveBeenCalledTimes(1);
    expect(mocks.upsertSecret.mock.calls[0][0]).toEqual({
      kind: "anthropic_api_key",
      value: "sk-ant-api01-realvalue",
      actor_id: "uuid-1",
    });
    expect(mocks.invalidateSecretCache).toHaveBeenCalledWith(
      "anthropic_api_key"
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/platform/settings/secrets"
    );
  });
});
