import { describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

type FakeClient = {
  auth: {
    getUser: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
};

type FakeClientFull = FakeClient & { rpc: ReturnType<typeof vi.fn> };

const makeClient = (config: {
  authUser: { id: string; email: string } | null;
  profile?: {
    id: string;
    display_name: string;
    base_role: string;
    organization_id: string | null;
  };
  appRoles?: Array<{ workspace_id: string | null; app_role: string }>;
  org_revoked?: boolean;
}): FakeClientFull => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: config.authUser },
      error: null,
    }),
  },
  rpc: vi.fn(async (name: string) => {
    if (name === "app_is_org_revoked") {
      return { data: config.org_revoked ?? false, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  }),
  from: vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: config.profile ?? null,
          error: config.profile ? null : { code: "PGRST116" },
        }),
      };
    }
    if (table === "user_app_roles") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        // Final await yields {data, error}
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: config.appRoles ?? [], error: null }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  }),
});

describe("getCurrentUser", () => {
  it("returns null when no auth session", async () => {
    const client = makeClient({ authUser: null });
    const result = await getCurrentUser(client as unknown as never);
    expect(result).toBeNull();
  });

  it("returns null when auth user exists but profile is missing (race during signup)", async () => {
    const client = makeClient({
      authUser: { id: "u-1", email: "u@example.com" },
      profile: undefined,
    });
    const result = await getCurrentUser(client as unknown as never);
    expect(result).toBeNull();
  });

  it("returns full CurrentUser shape when session + profile exist", async () => {
    const client = makeClient({
      authUser: { id: "u-1", email: "rep@example.com" },
      profile: {
        id: "u-1",
        display_name: "Rep One",
        base_role: "sales_rep",
        organization_id: "org-1",
      },
      appRoles: [
        { workspace_id: "ws-1", app_role: "sales_rep" },
        { workspace_id: null, app_role: "manager" },
      ],
    });
    const result = await getCurrentUser(client as unknown as never);
    expect(result).toEqual({
      user: { id: "u-1", email: "rep@example.com" },
      profile: {
        id: "u-1",
        display_name: "Rep One",
        base_role: "sales_rep",
        // Optional profile fields default through the mapper:
        //   phone -> null, notification_prefs -> {}, theme -> "system",
        //   mfa_* -> null (D-300).
        phone: null,
        notification_prefs: {},
        theme: "system",
        mfa_verified_at: null,
        mfa_enrolled_at: null,
        view_defaults: {},
      },
      org_id: "org-1",
      workspace_ids: ["ws-1"], // null workspace_ids excluded
      app_roles: [
        { workspace_id: "ws-1", app_role: "sales_rep" },
        { workspace_id: null, app_role: "manager" },
      ],
      // D-606 — overlay field; null when no active impersonation cookie.
      impersonation: null,
    });
  });

  it("super_admin returns org_id null and empty workspace_ids", async () => {
    const client = makeClient({
      authUser: { id: "u-sa", email: "sa@example.com" },
      profile: {
        id: "u-sa",
        display_name: "Super",
        base_role: "super_admin",
        organization_id: null,
      },
      appRoles: [],
    });
    const result = await getCurrentUser(client as unknown as never);
    expect(result?.org_id).toBeNull();
    expect(result?.workspace_ids).toEqual([]);
    expect(result?.profile.base_role).toBe("super_admin");
  });

  it("D-302 — returns null when caller's org is in org_session_revocations", async () => {
    const client = makeClient({
      authUser: { id: "u-1", email: "rep@example.com" },
      profile: {
        id: "u-1",
        display_name: "Rep One",
        base_role: "sales_rep",
        organization_id: "org-1",
      },
      appRoles: [{ workspace_id: "ws-1", app_role: "sales_rep" }],
      org_revoked: true,
    });
    const result = await getCurrentUser(client as unknown as never);
    expect(result).toBeNull();
    expect(client.rpc).toHaveBeenCalledWith("app_is_org_revoked", {
      org_id: "org-1",
    });
  });

  it("D-302 — returns CurrentUser when org is not revoked", async () => {
    const client = makeClient({
      authUser: { id: "u-1", email: "rep@example.com" },
      profile: {
        id: "u-1",
        display_name: "Rep One",
        base_role: "sales_rep",
        organization_id: "org-1",
      },
      appRoles: [{ workspace_id: "ws-1", app_role: "sales_rep" }],
      org_revoked: false,
    });
    const result = await getCurrentUser(client as unknown as never);
    expect(result).not.toBeNull();
    expect(result?.org_id).toBe("org-1");
  });

  it("D-302 — fails closed when revocation RPC errors (returns null)", async () => {
    const client: FakeClientFull = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u-1", email: "rep@example.com" } },
          error: null,
        }),
      },
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "kv-timeout" },
      })),
      from: vi.fn((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "u-1",
                display_name: "Rep One",
                base_role: "sales_rep",
                organization_id: "org-1",
              },
              error: null,
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    const result = await getCurrentUser(client as unknown as never);
    expect(result).toBeNull();
  });

  it("D-302 — super_admin (org_id null) skips the revocation RPC entirely", async () => {
    const client = makeClient({
      authUser: { id: "u-sa", email: "sa@example.com" },
      profile: {
        id: "u-sa",
        display_name: "Super",
        base_role: "super_admin",
        organization_id: null,
      },
      appRoles: [],
    });
    const result = await getCurrentUser(client as unknown as never);
    expect(result).not.toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
