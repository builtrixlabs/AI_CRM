import { describe, expect, it, vi } from "vitest";
import {
  createEndpoint,
  listEndpoints,
  sendTestDelivery,
  toggleEndpoint,
} from "@/lib/admin/webhooks";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "99999999-8888-4777-8666-555555555555";
const EP = "33333333-4444-4555-8666-777777777777";

function makeWriteClient() {
  const inserts: Record<string, unknown[]> = {
    webhook_endpoints: [],
    webhook_deliveries: [],
    audit_log: [],
  };
  const updates: Record<string, unknown[]> = { webhook_endpoints: [] };

  const epChain = {
    select: vi.fn(() => epChain),
    eq: vi.fn(() => epChain),
    is: vi.fn(() => epChain),
    order: vi.fn(() =>
      Promise.resolve({ data: inserts.webhook_endpoints, error: null })
    ),
    insert: vi.fn((row: Record<string, unknown>) => {
      inserts.webhook_endpoints.push({
        id: EP,
        ...row,
        secret: row.secret,
      });
      return Object.assign(epChain, {
        select: vi.fn(() => epChain),
        single: vi.fn(() => Promise.resolve({ data: { id: EP }, error: null })),
      });
    }),
    update: vi.fn((row: unknown) => {
      updates.webhook_endpoints.push(row);
      return Object.assign(epChain, {
        eq: vi.fn(() =>
          Object.assign(epChain, {
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })
        ),
      });
    }),
  };

  const delChain = {
    insert: vi.fn((row: Record<string, unknown>) => {
      inserts.webhook_deliveries.push(row);
      return Object.assign(delChain, {
        select: vi.fn(() => delChain),
        single: vi.fn(() =>
          Promise.resolve({ data: { id: "del-1" }, error: null })
        ),
      });
    }),
  };

  const auditChain = {
    insert: vi.fn((row: unknown) => {
      inserts.audit_log.push(row);
      return Promise.resolve({ error: null });
    }),
  };

  return {
    inserts,
    updates,
    client: {
      from: vi.fn((t: string) => {
        if (t === "webhook_endpoints") return epChain;
        if (t === "webhook_deliveries") return delChain;
        if (t === "audit_log") return auditChain;
        throw new Error(`unexpected ${t}`);
      }),
    },
  };
}

describe("createEndpoint", () => {
  it("inserts row with random secret + audits", async () => {
    const env = makeWriteClient();
    const r = await createEndpoint(
      {
        organization_id: ORG,
        user_id: USER,
        name: "Slack pipeline",
        url: "https://hooks.example.com/x",
        events: ["lead.created"],
      },
      env.client as never
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).toBe(EP);
    const inserted = env.inserts.webhook_endpoints[0] as { secret: string };
    expect(inserted.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(env.inserts.audit_log).toHaveLength(1);
  });

  it("rejects invalid URL", async () => {
    const env = makeWriteClient();
    const r = await createEndpoint(
      {
        organization_id: ORG,
        user_id: USER,
        name: "X",
        url: "not-a-url",
        events: [],
      },
      env.client as never
    );
    expect(r.ok).toBe(false);
    expect(env.inserts.webhook_endpoints).toHaveLength(0);
  });

  it("rejects empty name", async () => {
    const env = makeWriteClient();
    const r = await createEndpoint(
      {
        organization_id: ORG,
        user_id: USER,
        name: "",
        url: "https://x.com",
        events: [],
      },
      env.client as never
    );
    expect(r.ok).toBe(false);
  });
});

describe("toggleEndpoint", () => {
  it("flips enabled + audits", async () => {
    const env = makeWriteClient();
    const r = await toggleEndpoint(EP, ORG, false, USER, env.client as never);
    expect(r.ok).toBe(true);
    expect((env.updates.webhook_endpoints[0] as { enabled: boolean }).enabled).toBe(false);
    expect(env.inserts.audit_log).toHaveLength(1);
  });
});

describe("sendTestDelivery", () => {
  it("writes synthetic delivery + audits", async () => {
    const env = makeWriteClient();
    const r = await sendTestDelivery(EP, ORG, USER, env.client as never);
    expect(r.ok).toBe(true);
    expect(env.inserts.webhook_deliveries).toHaveLength(1);
    const row = env.inserts.webhook_deliveries[0] as Record<string, unknown>;
    expect(row.status_code).toBe(200);
    expect(row.event_kind).toBe("test.ping");
    expect(env.inserts.audit_log).toHaveLength(1);
  });
});

describe("listEndpoints", () => {
  it("masks the secret to last4 in returned rows", async () => {
    const longSecret = "a".repeat(60) + "f00d";
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      is: vi.fn(() => chain),
      order: vi.fn(() =>
        Promise.resolve({
          data: [
            {
              id: EP,
              organization_id: ORG,
              name: "X",
              url: "https://x.com",
              secret: longSecret,
              events_subscribed: ["lead.created"],
              enabled: true,
              created_at: "2026-05-09T00:00:00Z",
            },
          ],
          error: null,
        })
      ),
    };
    const client = { from: vi.fn(() => chain) };
    const rows = await listEndpoints(ORG, client as never);
    expect(rows).toHaveLength(1);
    expect(rows[0].secret_last4).toBe("f00d");
    // confirm full secret is NOT exposed in the typed shape
    expect((rows[0] as unknown as { secret?: string }).secret).toBeUndefined();
  });
});
