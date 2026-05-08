import { describe, expect, it, vi } from "vitest";
import {
  registerAgentHandler,
  runAgent,
} from "@/lib/agents/runtime";
import { TierCeilingExceededError } from "@/lib/agents/types";
import type { AgentInvocation } from "@/lib/agents/types";

const AGENT_ID = "00000000-0000-4000-8000-000000000aaa";
const ORG = "11111111-2222-4333-8444-555555555555";
const WS = "22222222-3333-4444-8555-666666666666";

function makeAgentClient(opts: {
  agent_row: {
    id: string;
    agent_type: string;
    display_name: string;
    max_tier: string;
    prompt_version: string;
  } | null;
}) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() =>
      Promise.resolve({ data: opts.agent_row, error: null }),
    ),
  };
  return {
    from: vi.fn((table: string) => {
      if (table === "agent_service_accounts") return chain;
      throw new Error(`Unexpected table ${table}`);
    }),
  };
}

const TEST_AGENT_ROW = {
  id: AGENT_ID,
  agent_type: "test_agent",
  display_name: "Test Agent",
  max_tier: "T1",
  prompt_version: "v1",
};

const baseInv: AgentInvocation = {
  agent_id: AGENT_ID,
  organization_id: ORG,
  workspace_id: WS,
  action: "test_action",
  attempted_tier: "T1",
  payload: { hello: "world" },
};

describe("runAgent — happy + error paths", () => {
  it("dispatches to the registered handler when ceiling is respected", async () => {
    const handler = vi.fn(async () => ({
      ok: true,
      tier: "T1",
      audit_log_id: null,
      output: { ran: true },
    }));
    registerAgentHandler("test_agent", "test_action", handler as never);
    const t = makeAgentClient({ agent_row: TEST_AGENT_ROW });
    const r = await runAgent(baseInv, { client: t as never });
    expect(r.ok).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns validation error when agent row not found", async () => {
    const t = makeAgentClient({ agent_row: null });
    const r = await runAgent(baseInv, { client: t as never });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toContain("not registered");
    }
  });

  it("returns validation error when handler is missing", async () => {
    const t = makeAgentClient({
      agent_row: { ...TEST_AGENT_ROW, agent_type: "unhandled_agent" },
    });
    const r = await runAgent(
      { ...baseInv, action: "ghost" },
      { client: t as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("validation");
      expect(r.message).toContain("no handler registered");
    }
  });

  it("THROWS TierCeilingExceededError when attempted > max", async () => {
    const t = makeAgentClient({
      agent_row: { ...TEST_AGENT_ROW, max_tier: "T1" },
    });
    await expect(
      runAgent(
        { ...baseInv, attempted_tier: "T2" },
        { client: t as never },
      ),
    ).rejects.toThrow(TierCeilingExceededError);
  });

  it("permits T0 against a T1-max agent (within ceiling)", async () => {
    const handler = vi.fn(async () => ({
      ok: true,
      tier: "T0",
      audit_log_id: null,
      output: {},
    }));
    registerAgentHandler("t0_agent", "do", handler as never);
    const t = makeAgentClient({
      agent_row: { ...TEST_AGENT_ROW, agent_type: "t0_agent" },
    });
    const r = await runAgent(
      { ...baseInv, action: "do", attempted_tier: "T0" },
      { client: t as never },
    );
    expect(r.ok).toBe(true);
  });

  it("returns unknown error when handler throws (non-Tier error)", async () => {
    const handler = vi.fn(async () => {
      throw new Error("boom");
    });
    registerAgentHandler("test_agent", "throw", handler as never);
    const t = makeAgentClient({ agent_row: TEST_AGENT_ROW });
    const r = await runAgent(
      { ...baseInv, action: "throw" },
      { client: t as never },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("unknown");
      expect(r.message).toContain("boom");
    }
  });

  it("propagates TierCeilingExceededError from a handler (defense-in-depth)", async () => {
    // A handler shouldn't throw this directly, but if it does the runtime
    // re-throws so the caller (Inngest function) sees it explicitly.
    const handler = vi.fn(async () => {
      throw new TierCeilingExceededError(AGENT_ID, "T2", "T1");
    });
    registerAgentHandler("test_agent", "tier_throw", handler as never);
    const t = makeAgentClient({ agent_row: TEST_AGENT_ROW });
    await expect(
      runAgent({ ...baseInv, action: "tier_throw" }, { client: t as never }),
    ).rejects.toThrow(TierCeilingExceededError);
  });
});
