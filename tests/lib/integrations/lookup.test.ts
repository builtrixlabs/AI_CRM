import { describe, expect, it, vi } from "vitest";
import {
  findOrgByVoiceIqSecret,
  lookupLead,
} from "@/lib/integrations/voice-iq/lookup";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const LEAD = "33333333-4444-4555-8666-777777777777";
const WS = "44444444-5555-4666-8777-888888888888";

function makeNodesClient(opts: {
  external_match?: { id: string; workspace_id: string } | null;
  phone_rows?: Array<{ id: string; workspace_id: string; data: { phone?: string } }>;
}) {
  // Track which query kind ran via the .eq() calls. The external_id query
  // hits `data->custom->>external_id`; the phone query selects `data` and
  // omits that .eq filter — so we can peek at the recorded .eq column args
  // to decide which branch's data to return at .limit() time.
  const client = {
    from: vi.fn((table: string) => {
      if (table !== "nodes") {
        throw new Error(`unexpected table ${table}`);
      }
      const eqArgs: string[] = [];
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((column: string) => {
          eqArgs.push(column);
          return chain;
        }),
        is: vi.fn(() => chain),
        limit: vi.fn(() => {
          const isExternal = eqArgs.some((c) => c.includes("external_id"));
          if (isExternal) {
            return Promise.resolve({
              data:
                opts.external_match === undefined || opts.external_match === null
                  ? []
                  : [opts.external_match],
              error: null,
            });
          }
          return Promise.resolve({ data: opts.phone_rows ?? [], error: null });
        }),
      };
      return chain;
    }),
  };
  return client;
}

describe("lookupLead", () => {
  it("matches by external_id (preferred over phone)", async () => {
    const client = makeNodesClient({
      external_match: { id: LEAD, workspace_id: WS },
    });
    const r = await lookupLead(
      { organization_id: ORG_A, external_id: "voice-iq-12345", phone: "9812345678" },
      client as never
    );
    expect(r).toEqual({ lead_node_id: LEAD, workspace_id: WS });
  });

  it("falls back to phone E.164 match when no external_id hit", async () => {
    const client = makeNodesClient({
      phone_rows: [
        {
          id: "wrong-1",
          workspace_id: WS,
          data: { phone: "+91 91234 56789" },
        },
        { id: LEAD, workspace_id: WS, data: { phone: "9812345678" } },
      ],
    });
    const r = await lookupLead(
      { organization_id: ORG_A, phone: "+91 98123 45678" },
      client as never
    );
    expect(r).toEqual({ lead_node_id: LEAD, workspace_id: WS });
  });

  it("returns null when phone unparseable", async () => {
    const client = makeNodesClient({});
    const r = await lookupLead(
      { organization_id: ORG_A, phone: "abc" },
      client as never
    );
    expect(r).toBeNull();
  });

  it("returns null when neither external_id nor phone provided", async () => {
    const client = makeNodesClient({});
    const r = await lookupLead({ organization_id: ORG_A }, client as never);
    expect(r).toBeNull();
  });

  it("returns null when no rows match", async () => {
    const client = makeNodesClient({
      external_match: null,
      phone_rows: [],
    });
    const r = await lookupLead(
      { organization_id: ORG_A, phone: "9812345678" },
      client as never
    );
    expect(r).toBeNull();
  });
});

describe("findOrgByVoiceIqSecret", () => {
  function makeSecretClient(rows: Array<{ organization_id: string; value: string }>) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    };
    return {
      from: vi.fn((table: string) => {
        if (table !== "org_integration_secrets") {
          throw new Error(`unexpected table ${table}`);
        }
        return chain;
      }),
    };
  }

  it("returns the matching org when secret matches a row", async () => {
    const client = makeSecretClient([
      { organization_id: ORG_A, value: "a".repeat(64) },
      { organization_id: ORG_B, value: "b".repeat(64) },
    ]);
    const r = await findOrgByVoiceIqSecret("a".repeat(64), client as never);
    expect(r).toBe(ORG_A);
  });

  it("returns null when secret matches no row", async () => {
    const client = makeSecretClient([
      { organization_id: ORG_A, value: "a".repeat(64) },
    ]);
    const r = await findOrgByVoiceIqSecret("z".repeat(64), client as never);
    expect(r).toBeNull();
  });

  it("returns null for too-short candidate (cheap defense)", async () => {
    const client = makeSecretClient([]);
    const r = await findOrgByVoiceIqSecret("short", client as never);
    expect(r).toBeNull();
  });

  it("returns null for empty / null", async () => {
    const client = makeSecretClient([]);
    expect(await findOrgByVoiceIqSecret("", client as never)).toBeNull();
  });
});
