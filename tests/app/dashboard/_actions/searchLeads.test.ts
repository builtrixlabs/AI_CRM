import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveForUser: vi.fn(),
}));

vi.mock("@/lib/auth/getCurrentUser", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<object>("@/lib/auth/permissions");
  return { ...actual, resolveForUser: mocks.resolveForUser };
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { searchLeads } from "@/app/(dashboard)/dashboard/_actions/searchLeads";

const SIGNED_IN = {
  user: { id: "u1", email: "rep@example.com" },
  profile: { id: "u1", display_name: "Rep", base_role: "sales_rep" },
  org_id: "org-1",
  workspace_ids: ["ws-1"],
  app_roles: [],
};

type ChainShape = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function makeClient(opts: {
  data?: unknown[] | null;
  error?: { message: string } | null;
}) {
  const ors: string[] = [];
  const limits: number[] = [];
  const final = {
    data: opts.data ?? [],
    error: opts.error ?? null,
  };
  const chain: ChainShape = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    or: vi.fn((expr: string) => {
      ors.push(expr);
      return chain;
    }),
    order: vi.fn(() => chain),
    limit: vi.fn((n: number) => {
      limits.push(n);
      return Promise.resolve(final);
    }),
  };
  const client = { from: vi.fn(() => chain) };
  return { client, ors, limits };
}

beforeEach(() => {
  for (const k of Object.keys(mocks) as (keyof typeof mocks)[]) {
    mocks[k].mockReset();
  }
  mocks.getCurrentUser.mockResolvedValue(SIGNED_IN);
  mocks.resolveForUser.mockReturnValue(new Set(["leads:view"]));
});

describe("searchLeads", () => {
  it("returns permission error when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const r = await searchLeads("foo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission");
  });

  it("returns permission error when user lacks leads:view", async () => {
    mocks.resolveForUser.mockReturnValue(new Set(["leads:create"]));
    const r = await searchLeads("foo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("permission");
  });

  it("rejects empty query (validation)", async () => {
    const t = makeClient({ data: [] });
    const r = await searchLeads("", undefined, t.client as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("rejects whitespace-only query (validation)", async () => {
    const t = makeClient({ data: [] });
    const r = await searchLeads("   ", undefined, t.client as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("rejects query > 80 chars (validation)", async () => {
    const t = makeClient({ data: [] });
    const r = await searchLeads("a".repeat(81), undefined, t.client as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("validation");
  });

  it("happy path: returns shaped results capped at default limit (8)", async () => {
    const t = makeClient({
      data: [
        {
          id: "lead-1",
          label: "Priya Sharma",
          state: "qualified",
          data: { phone: "+91-9876543210" },
        },
      ],
    });
    const r = await searchLeads("priya", undefined, t.client as never);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.results).toHaveLength(1);
      expect(r.results[0]).toEqual({
        id: "lead-1",
        label: "Priya Sharma",
        state: "qualified",
        phone: "+91-9876543210",
      });
    }
    expect(t.limits[0]).toBe(8);
  });

  it("respects an explicit limit (capped at MAX_LIMIT=20)", async () => {
    const t = makeClient({ data: [] });
    await searchLeads("a", 5, t.client as never);
    expect(t.limits[0]).toBe(5);
    const t2 = makeClient({ data: [] });
    await searchLeads("a", 100, t2.client as never);
    expect(t2.limits[0]).toBe(20);
  });

  it("escapes LIKE-special chars in the query (% _)", async () => {
    const t = makeClient({ data: [] });
    await searchLeads("a%b_c", undefined, t.client as never);
    // The .or() filter expression should contain the escaped pattern.
    expect(t.ors[0]).toContain("a\\%b\\_c");
  });

  it("returns unknown error on supabase error", async () => {
    const t = makeClient({ data: null, error: { message: "boom" } });
    const r = await searchLeads("foo", undefined, t.client as never);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("unknown");
      expect(r.message).toBe("boom");
    }
  });

  it("handles missing data.phone gracefully", async () => {
    const t = makeClient({
      data: [
        {
          id: "lead-2",
          label: "Acme Co",
          state: "new",
          data: null,
        },
      ],
    });
    const r = await searchLeads("acme", undefined, t.client as never);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.results[0]!.phone).toBeUndefined();
    }
  });

  it("sends the query to ILIKE on label OR data->>phone", async () => {
    const t = makeClient({ data: [] });
    await searchLeads("Sharma", undefined, t.client as never);
    expect(t.ors[0]).toMatch(/label\.ilike\.%Sharma%/);
    expect(t.ors[0]).toMatch(/data->>phone\.ilike\.%Sharma%/);
  });

  it("falls back to createSupabaseServerClient when no client is injected", async () => {
    const fake = makeClient({ data: [] });
    const { createSupabaseServerClient } = await import(
      "@/lib/supabase/server"
    );
    (createSupabaseServerClient as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      fake.client,
    );
    const r = await searchLeads("foo");
    expect(r.ok).toBe(true);
  });
});
