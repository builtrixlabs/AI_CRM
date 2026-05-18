import { describe, expect, it, vi } from "vitest";
import { getSystemHealth } from "@/lib/admin/system-health";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeClient(opts: {
  failed: Array<{ id: string; directive_id: string; ts: string; details: { reason?: string } | null }>;
  inbox_error_count: number;
  voice_iq: boolean;
  whatsapp: boolean;
}) {
  const failedChain = {
    select: vi.fn(() => failedChain),
    eq: vi.fn(() => failedChain),
    gte: vi.fn(() => failedChain),
    order: vi.fn(() => failedChain),
    limit: vi.fn(() => Promise.resolve({ data: opts.failed, error: null })),
  };
  const inboxChain = {
    select: vi.fn(() => inboxChain),
    eq: vi.fn(() => inboxChain),
    gte: vi.fn(() =>
      Promise.resolve({ count: opts.inbox_error_count, error: null })
    ),
  };
  const viqChain = {
    select: vi.fn(() => viqChain),
    eq: vi.fn(() => viqChain),
    limit: vi.fn(() =>
      Promise.resolve({
        data: opts.voice_iq ? [{ organization_id: ORG }] : [],
        error: null,
      })
    ),
  };
  const waChain = {
    select: vi.fn(() => waChain),
    eq: vi.fn(() => waChain),
    limit: vi.fn(() =>
      Promise.resolve({
        data: opts.whatsapp ? [{ organization_id: ORG }] : [],
        error: null,
      })
    ),
  };
  return {
    from: vi.fn((t: string) => {
      if (t === "directive_invocations") return failedChain;
      if (t === "event_inbox_log") return inboxChain;
      if (t === "org_integration_secrets") return viqChain;
      if (t === "org_whatsapp_endpoints") return waChain;
      throw new Error(`unexpected ${t}`);
    }),
  };
}

describe("getSystemHealth", () => {
  it("returns healthy posture when voice_iq + whatsapp configured + no failures (email V3-out-of-scope)", async () => {
    const client = makeClient({
      failed: [],
      inbox_error_count: 0,
      voice_iq: true,
      whatsapp: true,
    });
    const h = await getSystemHealth(ORG, client as never);
    expect(h.posture).toBe("healthy");
    expect(h.voice_iq_configured).toBe(true);
    expect(h.whatsapp_configured).toBe(true);
    expect(h.email_configured).toBe(false); // V3 — does not affect posture
  });

  it("returns failing posture when missing integrations + failures present", async () => {
    const client = makeClient({
      failed: [
        {
          id: "1",
          directive_id: "d1",
          ts: "2026-05-09T00:00:00Z",
          details: { reason: "timeout" },
        },
      ],
      inbox_error_count: 2,
      voice_iq: false,
      whatsapp: false,
    });
    const h = await getSystemHealth(ORG, client as never);
    expect(h.posture).toBe("failing");
    expect(h.failed_directives.count_7d).toBe(1);
    expect(h.failed_directives.recent[0].reason).toBe("timeout");
    expect(h.inbox_failures.count_7d).toBe(2);
  });

  it("returns degraded when only some integrations missing", async () => {
    const client = makeClient({
      failed: [],
      inbox_error_count: 0,
      voice_iq: true,
      whatsapp: false,
    });
    const h = await getSystemHealth(ORG, client as never);
    expect(h.posture).toBe("degraded");
  });

  it("limits recent failed list to 5 even if more exist", async () => {
    const client = makeClient({
      failed: Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        directive_id: `d-${i}`,
        ts: "2026-05-09T00:00:00Z",
        details: { reason: `err ${i}` },
      })),
      inbox_error_count: 0,
      voice_iq: true,
      whatsapp: true,
    });
    const h = await getSystemHealth(ORG, client as never);
    expect(h.failed_directives.count_7d).toBe(10);
    expect(h.failed_directives.recent).toHaveLength(5);
  });
});
