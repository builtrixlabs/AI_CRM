import { describe, expect, it, vi } from "vitest";
import {
  updateOwnProfile,
  updateProfileSchema,
} from "@/lib/auth/updateProfile";

const USER_ID = "11111111-2222-4333-8444-555555555555";

function makeClient(opts: {
  before: {
    display_name: string;
    phone: string | null;
    theme: string;
    notification_prefs: Record<string, unknown> | null;
    organization_id: string | null;
  } | null;
  updateError?: { message: string };
}) {
  const inserts: { audit_log: unknown[] } = { audit_log: [] };
  const profilesChain = {
    select: vi.fn(() => profilesChain),
    eq: vi.fn(() => profilesChain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: opts.before, error: null })
    ),
    update: vi.fn(() => ({
      eq: vi.fn(() =>
        Promise.resolve({ error: opts.updateError ?? null })
      ),
    })),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === "profiles") return profilesChain;
      if (table === "audit_log") {
        return {
          insert: vi.fn((row: unknown) => {
            inserts.audit_log.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`Unexpected ${table}`);
    }),
  };
  return { client, inserts, profilesChain };
}

describe("updateProfileSchema", () => {
  it("rejects empty display_name", () => {
    expect(
      updateProfileSchema.safeParse({
        display_name: "",
        theme: "system",
        notification_prefs: {},
      }).success
    ).toBe(false);
  });
  it("rejects unknown theme", () => {
    expect(
      updateProfileSchema.safeParse({
        display_name: "x",
        theme: "neon",
        notification_prefs: {},
      }).success
    ).toBe(false);
  });
  it("normalises empty phone to null", () => {
    const r = updateProfileSchema.safeParse({
      display_name: "x",
      phone: "",
      theme: "system",
      notification_prefs: {},
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.phone).toBeNull();
  });
});

describe("updateOwnProfile", () => {
  const before = {
    display_name: "Old Name",
    phone: null as string | null,
    theme: "system",
    notification_prefs: { email_enabled: true },
    organization_id: null as string | null,
  };

  it("writes update and emits audit row with before/after diff", async () => {
    const { client, inserts } = makeClient({ before });
    await updateOwnProfile(
      USER_ID,
      {
        display_name: "New Name",
        phone: "+91-9999999999",
        theme: "dark",
        notification_prefs: { email_enabled: false, in_app_enabled: true },
      },
      client as never
    );

    expect(inserts.audit_log).toHaveLength(1);
    const row = inserts.audit_log[0] as Record<string, unknown>;
    expect(row.action).toBe("profile_update");
    const diff = row.diff as { before: Record<string, unknown>; after: Record<string, unknown> };
    expect(diff.before.display_name).toBe("Old Name");
    expect(diff.after.display_name).toBe("New Name");
    expect(diff.after.theme).toBe("dark");
  });

  it("throws on missing profile", async () => {
    const { client } = makeClient({ before: null });
    await expect(
      updateOwnProfile(
        USER_ID,
        {
          display_name: "x",
          theme: "system",
          notification_prefs: {},
        },
        client as never
      )
    ).rejects.toThrow(/profile not found/);
  });

  it("propagates update errors", async () => {
    const { client } = makeClient({
      before,
      updateError: { message: "constraint violation" },
    });
    await expect(
      updateOwnProfile(
        USER_ID,
        {
          display_name: "x",
          theme: "system",
          notification_prefs: {},
        },
        client as never
      )
    ).rejects.toMatchObject({ message: "constraint violation" });
  });
});
