import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveForUser: vi.fn(),
  inviteUser: vi.fn(),
  changeBaseRole: vi.fn(),
  deactivateUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<object>("@/lib/auth/permissions");
  return { ...actual, resolveForUser: mocks.resolveForUser };
});
vi.mock("@/lib/users/admin", async () => {
  const actual = await vi.importActual<object>("@/lib/users/admin");
  return {
    ...actual,
    inviteUser: mocks.inviteUser,
    changeBaseRole: mocks.changeBaseRole,
    deactivateUser: mocks.deactivateUser,
  };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { usersAction } from "@/app/(settings)/settings/users/actions";
import { UsersAdminError } from "@/lib/users/types";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "22222222-3333-4444-8555-666666666666";

const SIGNED_IN_ADMIN = {
  user: { id: USER, email: "admin@x.com" },
  profile: { id: USER, display_name: "Admin", base_role: "org_admin" },
  org_id: ORG,
  workspace_ids: [],
  app_roles: [],
};

beforeEach(() => {
  for (const k of Object.keys(mocks) as (keyof typeof mocks)[]) {
    const m = mocks[k];
    if (m && typeof (m as { mockReset?: unknown }).mockReset === "function") {
      (m as { mockReset: () => void }).mockReset();
    }
  }
  mocks.getCurrentUser.mockResolvedValue(SIGNED_IN_ADMIN);
  mocks.resolveForUser.mockReturnValue(new Set(["settings:manage_users"]));
});

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("usersAction — gates", () => {
  it("returns permission for unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const r = await usersAction(fd({ intent: "invite" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission");
  });

  it("returns permission when missing settings:manage_users", async () => {
    mocks.resolveForUser.mockReturnValue(new Set(["leads:view"]));
    const r = await usersAction(fd({ intent: "invite" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission");
  });

  it("returns validation for unknown intent", async () => {
    const r = await usersAction(fd({ intent: "bogus" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toMatch(/bogus/i);
    }
  });
});

describe("usersAction — invite", () => {
  it("dispatches inviteUser on valid input", async () => {
    mocks.inviteUser.mockResolvedValue({ user_id: "new-id", created: true });
    const r = await usersAction(
      fd({
        intent: "invite",
        email: "fresh@x.com",
        display_name: "Fresh",
        base_role: "sales_rep",
      }),
    );
    expect(r.ok).toBe(true);
    expect(mocks.inviteUser).toHaveBeenCalledWith({
      caller_org_id: ORG,
      actor_id: USER,
      actor_role: "org_admin",
      input: {
        email: "fresh@x.com",
        display_name: "Fresh",
        base_role: "sales_rep",
      },
    });
  });

  it("returns fieldErrors on bad email", async () => {
    const r = await usersAction(
      fd({
        intent: "invite",
        email: "not-an-email",
        display_name: "X",
        base_role: "sales_rep",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.fieldErrors?.email).toBeTruthy();
    }
  });

  it("maps duplicate_email to validation message", async () => {
    mocks.inviteUser.mockRejectedValue(
      new UsersAdminError("Email already in another org", "duplicate_email"),
    );
    const r = await usersAction(
      fd({
        intent: "invite",
        email: "dup@x.com",
        display_name: "Dup",
        base_role: "sales_rep",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toMatch(/another org/);
    }
  });
});

describe("usersAction — change_role", () => {
  it("dispatches changeBaseRole with caller context", async () => {
    mocks.changeBaseRole.mockResolvedValue({
      user_id: "u1",
      from: "sales_rep",
      to: "manager",
    });
    const r = await usersAction(
      fd({
        intent: "change_role",
        user_id: "11111111-2222-4333-8444-555555555556",
        base_role: "manager",
      }),
    );
    expect(r.ok).toBe(true);
    expect(mocks.changeBaseRole).toHaveBeenCalled();
  });

  it("maps self_target to validation", async () => {
    mocks.changeBaseRole.mockRejectedValue(
      new UsersAdminError("Cannot change your own role", "self_target"),
    );
    const r = await usersAction(
      fd({
        intent: "change_role",
        user_id: "11111111-2222-4333-8444-555555555556",
        base_role: "manager",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toMatch(/own role/);
    }
  });
});

describe("usersAction — deactivate", () => {
  it("dispatches deactivateUser", async () => {
    mocks.deactivateUser.mockResolvedValue({ user_id: "u1" });
    const r = await usersAction(
      fd({
        intent: "deactivate",
        user_id: "11111111-2222-4333-8444-555555555556",
      }),
    );
    expect(r.ok).toBe(true);
    expect(mocks.deactivateUser).toHaveBeenCalled();
  });

  it("maps platform_user error to validation", async () => {
    mocks.deactivateUser.mockRejectedValue(
      new UsersAdminError("Cannot deactivate a super_admin", "platform_user"),
    );
    const r = await usersAction(
      fd({
        intent: "deactivate",
        user_id: "11111111-2222-4333-8444-555555555556",
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });
});
