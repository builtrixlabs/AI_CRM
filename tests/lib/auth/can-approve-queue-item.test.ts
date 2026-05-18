import { describe, expect, it } from "vitest";
import { canApproveQueueItem } from "@/lib/auth/can-approve-queue-item";
import type { CurrentUser } from "@/lib/auth/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const LEAD = "lead-1";
const REP = "u-rep";
const OTHER_REP = "u-other";

const makeUser = (
  base_role: CurrentUser["profile"]["base_role"],
  user_id: string = REP,
  org_id: string | null = ORG,
  app_roles: CurrentUser["app_roles"] = [],
): CurrentUser => ({
  user: { id: user_id, email: `${user_id}@example.com` },
  profile: { id: user_id, display_name: user_id, base_role },
  org_id,
  workspace_ids: ["ws-1"],
  app_roles,
});

/**
 * Minimal supabase chain stub. Captures the chain calls so a test can also
 * assert no DB read happened on the global-perm paths.
 */
function stubClient(leadData: Record<string, unknown> | null) {
  const calls: { table?: string; filters: Array<[string, unknown]> } = {
    filters: [],
  };
  const result =
    leadData === null
      ? { data: null, error: null }
      : { data: { data: leadData }, error: null };

  const chain = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      calls.filters.push([col, val]);
      return chain;
    },
    maybeSingle: async () => result,
  };
  const client = {
    from: (table: string) => {
      calls.table = table;
      return chain;
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe("canApproveQueueItem — global perms (skip owner check)", () => {
  it("workspace_admin (agents:approve_T2) returns true and does NOT query the lead", async () => {
    const { client, calls } = stubClient(null);
    const ok = await canApproveQueueItem(
      makeUser("workspace_admin"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(true);
    expect(calls.table).toBeUndefined();
  });

  it("org_admin (agents:view_activity) returns true and does NOT query the lead", async () => {
    const { client, calls } = stubClient(null);
    const ok = await canApproveQueueItem(
      makeUser("org_admin"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(true);
    expect(calls.table).toBeUndefined();
  });

  it("manager (agents:view_activity) returns true", async () => {
    const { client } = stubClient(null);
    const ok = await canApproveQueueItem(
      makeUser("manager"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(true);
  });

  it("org_owner returns true", async () => {
    const { client } = stubClient(null);
    const ok = await canApproveQueueItem(
      makeUser("org_owner"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(true);
  });
});

describe("canApproveQueueItem — owner-scoped (sales_rep)", () => {
  it("returns true when the rep owns the lead", async () => {
    const { client, calls } = stubClient({ assigned_sales_rep_id: REP });
    const ok = await canApproveQueueItem(
      makeUser("sales_rep"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(true);
    expect(calls.table).toBe("nodes");
    expect(calls.filters).toContainEqual(["id", LEAD]);
    expect(calls.filters).toContainEqual(["organization_id", ORG]);
    expect(calls.filters).toContainEqual(["node_type", "lead"]);
  });

  it("returns false when the rep does NOT own the lead", async () => {
    const { client } = stubClient({ assigned_sales_rep_id: OTHER_REP });
    const ok = await canApproveQueueItem(
      makeUser("sales_rep"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(false);
  });

  it("returns false when the lead has no assigned_sales_rep_id", async () => {
    const { client } = stubClient({ some_other_field: "x" });
    const ok = await canApproveQueueItem(
      makeUser("sales_rep"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(false);
  });

  it("returns false when the lead row is not found", async () => {
    const { client } = stubClient(null);
    const ok = await canApproveQueueItem(
      makeUser("sales_rep"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(false);
  });

  it("phone-rep roles inherit the owner-scoped approval path", async () => {
    for (const role of [
      "presales_rep",
      "telemarketing_rep",
      "customer_recovery_rep",
    ] as const) {
      const { client } = stubClient({ assigned_sales_rep_id: REP });
      const ok = await canApproveQueueItem(
        makeUser(role),
        { lead_id: LEAD, organization_id: ORG },
        client,
      );
      expect(ok, `${role} owns the lead`).toBe(true);
    }
  });

  it("phone-rep roles cannot approve unowned leads", async () => {
    const { client } = stubClient({ assigned_sales_rep_id: OTHER_REP });
    const ok = await canApproveQueueItem(
      makeUser("presales_rep"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(false);
  });
});

describe("canApproveQueueItem — cross-tenant defense", () => {
  it("returns false when queue row org differs from user org (workspace_admin)", async () => {
    const { client, calls } = stubClient({ assigned_sales_rep_id: REP });
    const ok = await canApproveQueueItem(
      makeUser("workspace_admin", REP, ORG),
      { lead_id: LEAD, organization_id: OTHER_ORG },
      client,
    );
    expect(ok).toBe(false);
    expect(calls.table).toBeUndefined();
  });

  it("returns false when queue row org differs from user org (sales_rep)", async () => {
    const { client, calls } = stubClient({ assigned_sales_rep_id: REP });
    const ok = await canApproveQueueItem(
      makeUser("sales_rep", REP, ORG),
      { lead_id: LEAD, organization_id: OTHER_ORG },
      client,
    );
    expect(ok).toBe(false);
    expect(calls.table).toBeUndefined();
  });

  it("returns false when user has no org_id", async () => {
    const { client } = stubClient({ assigned_sales_rep_id: REP });
    const ok = await canApproveQueueItem(
      makeUser("sales_rep", REP, null),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(false);
  });
});

describe("canApproveQueueItem — roles without the perm", () => {
  it("read_only returns false", async () => {
    const { client } = stubClient({ assigned_sales_rep_id: REP });
    const ok = await canApproveQueueItem(
      makeUser("read_only"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(false);
  });

  it("channel_partner returns false", async () => {
    const { client } = stubClient({ assigned_sales_rep_id: REP });
    const ok = await canApproveQueueItem(
      makeUser("channel_partner"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(false);
  });

  it("site_visit_coordinator returns false (coordinator does not approve drafts)", async () => {
    const { client } = stubClient({ assigned_sales_rep_id: REP });
    const ok = await canApproveQueueItem(
      makeUser("site_visit_coordinator"),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(false);
  });

  it("super_admin operational set is empty — returns false", async () => {
    const { client } = stubClient({ assigned_sales_rep_id: REP });
    const ok = await canApproveQueueItem(
      makeUser("super_admin", REP, null),
      { lead_id: LEAD, organization_id: ORG },
      client,
    );
    expect(ok).toBe(false);
  });
});
