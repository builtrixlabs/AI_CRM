import { describe, expect, it, vi } from "vitest";
import { getContactCanvas, listContacts } from "@/lib/contacts/api";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const CONTACT_ID = "33333333-4444-4555-8666-777777777777";

type ContactNodeRow = {
  id: string;
  organization_id: string;
  workspace_id: string;
  label: string;
  data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type NeighbourRow = {
  id: string;
  node_type: string;
  label: string;
  state: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
  created_by: string;
  created_via: string;
  ai_confidence: number | null;
  organization_id?: string;
};

type Opts = {
  contact?: ContactNodeRow;
  edges?: Array<{ from_node_id: string; to_node_id: string }>;
  neighbours?: NeighbourRow[];
  list_rows?: Array<{
    id: string;
    label: string;
    data: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  }>;
};

function makeClient(opts: Opts) {
  function fromHandler(table: string) {
    if (table === "nodes") {
      return {
        select: (_cols?: string) => {
          const filters: Record<string, unknown> = {};
          const inFilters: Record<string, unknown[]> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (k: string, v: unknown) => {
            filters[k] = v;
            return chain;
          };
          chain.in = (k: string, v: unknown[]) => {
            inFilters[k] = v;
            return chain;
          };
          chain.is = (k: string, v: unknown) => {
            filters[`${k}_is`] = v;
            return chain;
          };
          chain.order = () => chain;
          chain.limit = () => chain;
          chain.maybeSingle = () => {
            const c = opts.contact;
            if (!c) return Promise.resolve({ data: null, error: null });
            if (filters.id !== c.id) return Promise.resolve({ data: null, error: null });
            if (filters.node_type !== "contact")
              return Promise.resolve({ data: null, error: null });
            if (
              filters.organization_id != null &&
              filters.organization_id !== c.organization_id
            )
              return Promise.resolve({ data: null, error: null });
            return Promise.resolve({ data: c, error: null });
          };
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            // Neighbour lookup (in by id list)
            if (inFilters.id) {
              const ids = new Set(inFilters.id as string[]);
              const filtered = (opts.neighbours ?? []).filter(
                (n) =>
                  ids.has(n.id) &&
                  (filters.organization_id == null ||
                    n.organization_id === filters.organization_id),
              );
              return Promise.resolve({ data: filtered, error: null }).then(
                resolve,
              );
            }
            // List contacts
            const list = (opts.list_rows ?? []).filter((r) => {
              if (
                filters.organization_id != null &&
                (filters.organization_id !==
                  (opts.contact?.organization_id ?? ORG_A))
              ) {
                return false;
              }
              return true;
            });
            // Honour explicit filter mismatch: if organization_id filter doesn't
            // match a sentinel org we set on list_rows, skip.
            return Promise.resolve({ data: list, error: null }).then(resolve);
          };
          return chain;
        },
      };
    }
    if (table === "edges") {
      return {
        select: (_cols?: string) => {
          const chain: Record<string, unknown> = {};
          chain.or = () => chain;
          chain.is = () => chain;
          (chain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) =>
            Promise.resolve({ data: opts.edges ?? [], error: null }).then(
              resolve,
            );
          return chain;
        },
      };
    }
    throw new Error(`unhandled table: ${table}`);
  }
  return { client: { from: vi.fn(fromHandler) } as unknown as never };
}

describe("getContactCanvas", () => {
  it("returns null when contact_id is malformed", async () => {
    const m = makeClient({});
    const r = await getContactCanvas("not-a-uuid", ORG_A, m.client);
    expect(r).toBeNull();
  });

  it("returns null when contact not found", async () => {
    const m = makeClient({});
    const r = await getContactCanvas(CONTACT_ID, ORG_A, m.client);
    expect(r).toBeNull();
  });

  it("returns null when contact belongs to a different org (cross-tenant)", async () => {
    const m = makeClient({
      contact: {
        id: CONTACT_ID,
        organization_id: ORG_B,
        workspace_id: "ws-1",
        label: "Mr Patel",
        data: {},
        created_at: "2026-05-01",
        updated_at: "2026-05-01",
      },
    });
    const r = await getContactCanvas(CONTACT_ID, ORG_A, m.client);
    expect(r).toBeNull();
  });

  it("returns a contact + partitions neighbours by node_type", async () => {
    const m = makeClient({
      contact: {
        id: CONTACT_ID,
        organization_id: ORG_A,
        workspace_id: "ws-1",
        label: "Mr Patel",
        data: {
          email: "p@example.com",
          phone: "+91 99000 11111",
          primary_address: "Bangalore",
          notes: "Repeat buyer",
        },
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-02T00:00:00.000Z",
      },
      edges: [
        { from_node_id: CONTACT_ID, to_node_id: "lead-1" },
        { from_node_id: "deal-1", to_node_id: CONTACT_ID },
        { from_node_id: CONTACT_ID, to_node_id: "sv-1" },
        { from_node_id: CONTACT_ID, to_node_id: "act-1" },
      ],
      neighbours: [
        {
          id: "lead-1",
          node_type: "lead",
          label: "Lakeside enquiry",
          state: "qualified",
          data: {},
          created_at: "2026-05-01",
          created_by: "u",
          created_via: "manual",
          ai_confidence: null,
          organization_id: ORG_A,
        },
        {
          id: "deal-1",
          node_type: "deal",
          label: "Lakeside 3BHK booking",
          state: "negotiation",
          data: {},
          created_at: "2026-05-02",
          created_by: "u",
          created_via: "manual",
          ai_confidence: null,
          organization_id: ORG_A,
        },
        {
          id: "sv-1",
          node_type: "site_visit",
          label: "Lakeside tour",
          state: "scheduled",
          data: {},
          created_at: "2026-05-03",
          created_by: "u",
          created_via: "manual",
          ai_confidence: null,
          organization_id: ORG_A,
        },
        {
          id: "act-1",
          node_type: "activity",
          label: "Called buyer",
          state: null,
          data: {},
          created_at: "2026-05-04T10:00:00.000Z",
          created_by: "u",
          created_via: "manual",
          ai_confidence: null,
          organization_id: ORG_A,
        },
      ],
    });

    const r = await getContactCanvas(CONTACT_ID, ORG_A, m.client);
    expect(r).not.toBeNull();
    expect(r!.contact.email).toBe("p@example.com");
    expect(r!.contact.phone).toBe("+91 99000 11111");
    expect(r!.leads).toHaveLength(1);
    expect(r!.deals).toHaveLength(1);
    expect(r!.site_visits).toHaveLength(1);
    expect(r!.activities).toHaveLength(1);
    expect(r!.activities[0]?.label).toBe("Called buyer");
  });

  it("filters cross-tenant neighbours out of the canvas", async () => {
    const m = makeClient({
      contact: {
        id: CONTACT_ID,
        organization_id: ORG_A,
        workspace_id: "ws-1",
        label: "Mr Patel",
        data: {},
        created_at: "2026-05-01",
        updated_at: "2026-05-01",
      },
      edges: [{ from_node_id: CONTACT_ID, to_node_id: "lead-x" }],
      neighbours: [
        {
          id: "lead-x",
          node_type: "lead",
          label: "Other-org lead",
          state: null,
          data: {},
          created_at: "2026-05-01",
          created_by: "u",
          created_via: "manual",
          ai_confidence: null,
          organization_id: ORG_B,
        },
      ],
    });
    const r = await getContactCanvas(CONTACT_ID, ORG_A, m.client);
    expect(r).not.toBeNull();
    expect(r!.leads).toEqual([]);
  });
});

describe("listContacts", () => {
  it("returns mapped rows with email/phone hydrated from data jsonb", async () => {
    const m = makeClient({
      list_rows: [
        {
          id: "c-1",
          label: "Mr Patel",
          data: { email: "p@example.com", phone: "+91 999" },
          created_at: "2026-05-01",
          updated_at: "2026-05-01",
        },
        {
          id: "c-2",
          label: "Ms Rao",
          data: null,
          created_at: "2026-05-02",
          updated_at: "2026-05-02",
        },
      ],
    });
    const r = await listContacts({ organization_id: ORG_A }, m.client);
    expect(r).toHaveLength(2);
    expect(r[0]?.email).toBe("p@example.com");
    expect(r[1]?.email).toBeNull();
  });
});
