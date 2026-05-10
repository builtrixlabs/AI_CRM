import { describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

type FakeClient = {
  auth: {
    getUser: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
};

const makeClient = (config: {
  authUser: { id: string; email: string } | null;
  profile?: {
    id: string;
    display_name: string;
    base_role: string;
    organization_id: string | null;
  };
  appRoles?: Array<{ workspace_id: string | null; app_role: string }>;
}): FakeClient => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: config.authUser },
      error: null,
    }),
  },
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
      },
      org_id: "org-1",
      workspace_ids: ["ws-1"], // null workspace_ids excluded
      app_roles: [
        { workspace_id: "ws-1", app_role: "sales_rep" },
        { workspace_id: null, app_role: "manager" },
      ],
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
});
