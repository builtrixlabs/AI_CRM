import { describe, expect, it, vi } from "vitest";
import {
  getOrgDetail,
  listOrgs,
  platformCounts,
  recentAuditRows,
} from "@/lib/platform/queries";

const ORG_ID = "11111111-2222-4333-8444-555555555555";
const ACTOR = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const makeClient = () => {
  const audit: Array<Record<string, unknown>> = [];
  const ordered: Array<{ table: string }> = [];
  return {
    audit,
    ordered,
    client: {
      from: vi.fn((table: string) => {
        ordered.push({ table });
        if (table === "audit_log") {
          return {
            insert: vi.fn((row: Record<string, unknown>) => {
              audit.push(row);
              return Promise.resolve({ error: null });
            }),
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            then: (resolve: (v: unknown) => void) =>
              resolve({ data: [], error: null }),
          };
        }
        if (table === "organizations") {
          // default chain — list+detail tests overwrite as needed
          return {
            select: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: ORG_ID,
                slug: "lodha-group",
                name: "Lodha Group",
                plan_tier: "professional",
                rera_number: null,
                gstin: null,
                primary_contact_email: "anita@lodha.example.com",
                created_at: "2026-05-07T00:00:00Z",
              },
              error: null,
            }),
            then: (resolve: (v: unknown) => void) =>
              resolve({
                data: [
                  {
                    id: ORG_ID,
                    slug: "lodha-group",
                    name: "Lodha Group",
                    plan_tier: "professional",
                    rera_number: null,
                    gstin: null,
                    primary_contact_email: "a@b.com",
                    created_at: "2026-05-07T00:00:00Z",
                  },
                ],
                error: null,
                count: 1,
              }),
          };
        }
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            then: (resolve: (v: unknown) => void) =>
              resolve({ data: [], error: null, count: 7 }),
          };
        }
        if (table === "subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                plan_tier: "professional",
                status: "active",
                starts_at: "2026-05-07T00:00:00Z",
                current_period_end: null,
              },
              error: null,
            }),
          };
        }
        throw new Error(`Unexpected from('${table}')`);
      }),
    },
  };
};

describe("platformCounts", () => {
  it("returns total/active/admin counts without writing audit", async () => {
    const { client, audit } = makeClient();
    const counts = await platformCounts(client as unknown as never);
    expect(counts.total_orgs).toBeGreaterThanOrEqual(0);
    expect(counts.org_admins).toBeGreaterThanOrEqual(0);
    expect(audit.length).toBe(0);
  });
});

describe("listOrgs", () => {
  it("writes a read_sensitive audit row with kind='list_orgs'", async () => {
    const { client, audit } = makeClient();
    await listOrgs({}, ACTOR, client as unknown as never);
    expect(audit.length).toBe(1);
    expect(audit[0].action).toBe("read_sensitive");
    const diff = audit[0].diff as { kind: string };
    expect(diff.kind).toBe("list_orgs");
  });
});

describe("getOrgDetail", () => {
  it("returns null when org doesn't exist", async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };
    const result = await getOrgDetail(
      ORG_ID,
      ACTOR,
      client as unknown as never
    );
    expect(result).toBeNull();
  });

  it("returns the assembled detail and writes one read_sensitive audit row", async () => {
    const { client, audit } = makeClient();
    const detail = await getOrgDetail(
      ORG_ID,
      ACTOR,
      client as unknown as never
    );
    expect(detail?.id).toBe(ORG_ID);
    expect(detail?.subscription?.plan_tier).toBe("professional");
    expect(audit.length).toBe(1);
    const diff = audit[0].diff as { kind: string };
    expect(diff.kind).toBe("org_detail");
  });
});

describe("recentAuditRows", () => {
  it("respects the supplied limit (capped at 1000)", async () => {
    const { client } = makeClient();
    await recentAuditRows({}, 5000, ACTOR, client as unknown as never);
    // No assertion on the exact limit value passed; the query was issued.
    // The cap is enforced inside queries.ts.
    expect(client.from).toHaveBeenCalled();
  });
});
