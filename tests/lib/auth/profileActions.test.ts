import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  updateOwnProfile: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/lib/auth/updateProfile", async () => {
  const actual: typeof import("@/lib/auth/updateProfile") = await vi.importActual(
    "@/lib/auth/updateProfile",
  );
  return {
    ...actual,
    updateOwnProfile: mocks.updateOwnProfile,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { updateOwnProfileAction } from "@/lib/auth/profileActions";

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.updateOwnProfile.mockReset();
  mocks.revalidatePath.mockReset();
});

function fd(input: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(input)) f.set(k, v);
  return f;
}

describe("updateOwnProfileAction", () => {
  it("rejects unauthenticated callers with permission error", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const r = await updateOwnProfileAction(fd({ display_name: "x" }));
    expect(r).toEqual({ ok: false, error: "permission" });
    expect(mocks.updateOwnProfile).not.toHaveBeenCalled();
  });

  it("returns validation error on bad input", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      user: { id: "u1", email: "a@b.com" },
    });
    const r = await updateOwnProfileAction(
      fd({ display_name: "", theme: "system" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
    expect(mocks.updateOwnProfile).not.toHaveBeenCalled();
  });

  it("calls updateOwnProfile + revalidates all profile paths on success", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      user: { id: "u1", email: "a@b.com" },
    });
    mocks.updateOwnProfile.mockResolvedValue(undefined);
    const f = fd({
      display_name: "Asha",
      phone: "+91-9000000000",
      theme: "dark",
      notif_email: "on",
      notif_in_app: "on",
      notif_digest: "daily",
    });
    const r = await updateOwnProfileAction(f);
    expect(r).toEqual({ ok: true });
    expect(mocks.updateOwnProfile).toHaveBeenCalledWith("u1", {
      display_name: "Asha",
      phone: "+91-9000000000",
      theme: "dark",
      notification_prefs: {
        email_enabled: true,
        in_app_enabled: true,
        digest_frequency: "daily",
      },
    });
    const paths = mocks.revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/dashboard/settings");
    expect(paths).toContain("/cp/settings");
    expect(paths).toContain("/platform/settings/profile");
  });

  it("treats unchecked notification boxes as false", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      user: { id: "u1", email: "a@b.com" },
    });
    mocks.updateOwnProfile.mockResolvedValue(undefined);
    const r = await updateOwnProfileAction(
      fd({
        display_name: "Asha",
        theme: "system",
        notif_digest: "off",
      }),
    );
    expect(r).toEqual({ ok: true });
    // updateProfileSchema's `.transform` normalises empty/missing phone to null.
    expect(mocks.updateOwnProfile).toHaveBeenCalledWith("u1", {
      display_name: "Asha",
      phone: null,
      theme: "system",
      notification_prefs: {
        email_enabled: false,
        in_app_enabled: false,
        digest_frequency: "off",
      },
    });
  });

  it("returns 'unknown' when updateOwnProfile throws", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      user: { id: "u1", email: "a@b.com" },
    });
    mocks.updateOwnProfile.mockRejectedValue(new Error("boom"));
    const r = await updateOwnProfileAction(
      fd({ display_name: "Asha", theme: "system" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("unknown");
      expect(r.message).toBe("boom");
    }
  });
});
