import { describe, expect, it, vi } from "vitest";
import { PermissionDenied } from "@/lib/auth/permissions";
import {
  provisionOrganization,
  provisionOrganizationSchema,
} from "@/lib/platform/provision";
import type { CurrentUser } from "@/lib/auth/types";

const ORG_ID = "11111111-2222-4333-8444-555555555555";
const WS_ID = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const USER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const superAdmin: CurrentUser = {
  user: { id: USER_ID, email: "su@builtrix.in" },
  profile: { id: USER_ID, display_name: "Super", base_role: "super_admin" },
  org_id: null,
  workspace_ids: [],
  app_roles: [],
};

const operationalUser: CurrentUser = {
  ...superAdmin,
  profile: { ...superAdmin.profile, base_role: "sales_rep" },
  org_id: "any",
};

const validInput = {
  name: "Lodha Group",
  slug: "lodha-group",
  primary_contact_name: "Anita Bhalla",
  primary_contact_email: "anita@lodha.example.com",
  org_admin_password: "initial-strong-password-1",
  plan_tier: "professional" as const,
};

describe("provisionOrganizationSchema", () => {
  it("accepts a valid input", () => {
    expect(provisionOrganizationSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects bad slug", () => {
    expect(
      provisionOrganizationSchema.safeParse({ ...validInput, slug: "Lodha Group" })
        .success
    ).toBe(false);
  });

  it("rejects unknown plan_tier", () => {
    expect(
      provisionOrganizationSchema.safeParse({ ...validInput, plan_tier: "infinite" })
        .success
    ).toBe(false);
  });

  it("rejects missing org_admin_password", () => {
    const { org_admin_password: _omit, ...rest } = validInput;
    void _omit;
    expect(provisionOrganizationSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects org_admin_password shorter than 8 chars", () => {
    expect(
      provisionOrganizationSchema.safeParse({
        ...validInput,
        org_admin_password: "short",
      }).success
    ).toBe(false);
  });

  it("rejects unknown rera_number key (strict — RERA was removed)", () => {
    expect(
      provisionOrganizationSchema.safeParse({
        ...validInput,
        rera_number: "RERA-AGENT-XYZ",
      }).success
    ).toBe(false);
  });

  it("rejects unknown top-level keys (strict)", () => {
    expect(
      provisionOrganizationSchema.safeParse({
        ...validInput,
        injected: "evil",
      }).success
    ).toBe(false);
  });
});

const okSelectSingle = (data: unknown) => ({ data, error: null });
const okInsert = (data: unknown) => ({
  select: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data, error: null }),
});

const happyClient = () => {
  const calls: Array<{ table: string; op: string }> = [];
  return {
    calls,
    client: {
      from: vi.fn((table: string) => {
        if (table === "organizations") {
          return {
            insert: vi.fn(() => {
              calls.push({ table, op: "insert" });
              return okInsert({ id: ORG_ID });
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "workspaces") {
          return {
            insert: vi.fn(() => {
              calls.push({ table, op: "insert" });
              return okInsert({ id: WS_ID });
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            insert: vi.fn(() => {
              calls.push({ table, op: "insert" });
              return Promise.resolve({ error: null });
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "subscriptions") {
          return {
            insert: vi.fn(() => {
              calls.push({ table, op: "insert" });
              return Promise.resolve({ error: null });
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "audit_log") {
          return {
            insert: vi.fn(() => {
              calls.push({ table, op: "insert" });
              return Promise.resolve({ error: null });
            }),
          };
        }
        throw new Error(`Unexpected from('${table}')`);
      }),
      auth: {
        admin: {
          createUser: vi.fn(() => {
            calls.push({ table: "auth", op: "createUser" });
            return Promise.resolve(okSelectSingle({ user: { id: USER_ID } }));
          }),
          generateLink: vi.fn(() => {
            calls.push({ table: "auth", op: "generateLink" });
            return Promise.resolve({
              data: {
                properties: { action_link: "https://example/auth#token=xyz" },
              },
              error: null,
            });
          }),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    },
  };
};

describe("provisionOrganization happy path", () => {
  it("inserts org + workspace + invites + profile + subscription + audit", async () => {
    const { client, calls } = happyClient();
    const result = await provisionOrganization(
      superAdmin,
      validInput,
      client as unknown as never
    );
    expect(result.organization_id).toBe(ORG_ID);
    expect(result.workspace_id).toBe(WS_ID);
    expect(result.org_admin_user_id).toBe(USER_ID);
    expect(result.org_admin_email).toBe("anita@lodha.example.com");

    const ops = calls.map((c) => `${c.table}:${c.op}`);
    // Provision flow no longer mints a magic link (operator-set
    // password path; 2026-05-08).
    expect(ops).toEqual([
      "organizations:insert",
      "workspaces:insert",
      "auth:createUser",
      "profiles:insert",
      "subscriptions:insert",
      "audit_log:insert",
    ]);
  });
});

describe("provisionOrganization gates on requirePermission", () => {
  it("throws PermissionDenied for non-super_admin (no DB calls)", async () => {
    const { client, calls } = happyClient();
    await expect(
      provisionOrganization(operationalUser, validInput, client as unknown as never)
    ).rejects.toBeInstanceOf(PermissionDenied);
    expect(calls.length).toBe(0);
  });
});

describe("provisionOrganization rollback paths", () => {
  it("slug collision (orgs INSERT fails) — no other rows touched", async () => {
    const calls: Array<{ table: string; op: string }> = [];
    const client = {
      from: vi.fn((table: string) => {
        if (table === "organizations") {
          return {
            insert: vi.fn(() => {
              calls.push({ table, op: "insert" });
              return {
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: "23505", message: "duplicate slug" },
                }),
              };
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        // any other table accessed during rollback should not have been called
        // in a "clean fail" path — the ORG insert is step 1 and failed.
        if (table === "workspaces" || table === "profiles" || table === "subscriptions") {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        throw new Error(`Unexpected from('${table}')`);
      }),
      auth: { admin: { deleteUser: vi.fn() } },
    };

    await expect(
      provisionOrganization(superAdmin, validInput, client as unknown as never)
    ).rejects.toMatchObject({ code: "23505" });

    const inserts = calls.filter((c) => c.op === "insert");
    expect(inserts.length).toBe(1);
    expect(inserts[0].table).toBe("organizations");
  });

  it("createUser failure rolls back org + workspace", async () => {
    const deleteCalls: string[] = [];
    const client = {
      from: vi.fn((table: string) => {
        if (table === "organizations") {
          return {
            insert: vi.fn(() => okInsert({ id: ORG_ID })),
            delete: vi.fn(() => ({
              eq: vi.fn().mockImplementation(() => {
                deleteCalls.push("organizations");
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === "workspaces") {
          return {
            insert: vi.fn(() => okInsert({ id: WS_ID })),
            delete: vi.fn(() => ({
              eq: vi.fn().mockImplementation(() => {
                deleteCalls.push("workspaces");
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === "profiles" || table === "subscriptions") {
          return {
            delete: vi.fn(() => ({
              eq: vi.fn().mockImplementation(() => {
                deleteCalls.push(table);
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        throw new Error(`Unexpected from('${table}')`);
      }),
      auth: {
        admin: {
          createUser: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: "rate limit" } })
          ),
          generateLink: vi.fn(),
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    };

    await expect(
      provisionOrganization(superAdmin, validInput, client as unknown as never)
    ).rejects.toMatchObject({ message: "rate limit" });

    // Rollback hit organizations + workspaces + subscriptions (best-effort).
    expect(deleteCalls).toContain("organizations");
    expect(deleteCalls).toContain("workspaces");
  });
});
