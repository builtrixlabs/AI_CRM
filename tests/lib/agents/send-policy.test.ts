import { describe, expect, it, vi } from "vitest";
import {
  resolveSendPolicy,
  isConfigurableAgentKind,
  isLockedAgentKind,
  DEFAULT_SEND_POLICY,
  POLICY_CONFIGURABLE_AGENT_KINDS,
  LOCKED_AGENT_KINDS,
} from "@/lib/agents/send-policy";

const ORG = "11111111-2222-4333-8444-555555555555";

function makeClient(opts: {
  row?: { mode: string } | null;
  error?: { message: string } | null;
}) {
  const filters: Record<string, unknown> = {};
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return b;
    },
    maybeSingle: () =>
      Promise.resolve({ data: opts.row ?? null, error: opts.error ?? null }),
  });
  return { filters, client: { from: () => b } };
}

describe("resolveSendPolicy", () => {
  it("returns require_approval (the default) when no row exists — AC-1", async () => {
    const { client } = makeClient({ row: null });
    expect(await resolveSendPolicy(ORG, "brochure_send", client as never)).toBe(
      "require_approval",
    );
  });

  it("returns the stored auto_send mode", async () => {
    const { client } = makeClient({ row: { mode: "auto_send" } });
    expect(await resolveSendPolicy(ORG, "brochure_send", client as never)).toBe(
      "auto_send",
    );
  });

  it("returns require_approval when the stored mode is require_approval", async () => {
    const { client } = makeClient({ row: { mode: "require_approval" } });
    expect(
      await resolveSendPolicy(ORG, "follow_up_stale_lead", client as never),
    ).toBe("require_approval");
  });

  it("degrades to require_approval on a query error (e.g. table absent)", async () => {
    const { client } = makeClient({
      row: null,
      error: { message: 'relation "agent_message_policies" does not exist' },
    });
    expect(await resolveSendPolicy(ORG, "brochure_send", client as never)).toBe(
      "require_approval",
    );
  });

  it("hard-returns require_approval for a locked agent kind without querying", async () => {
    const spy = vi.fn();
    const client = { from: spy };
    expect(
      await resolveSendPolicy(ORG, "site_visit_booking", client as never),
    ).toBe("require_approval");
    expect(spy).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the org + agent_kind — AC-6", async () => {
    const { client, filters } = makeClient({ row: { mode: "auto_send" } });
    await resolveSendPolicy(ORG, "brochure_send", client as never);
    expect(filters.organization_id).toBe(ORG);
    expect(filters.agent_kind).toBe("brochure_send");
  });
});

describe("agent-kind classification", () => {
  it("isConfigurableAgentKind recognizes the configurable kinds", () => {
    expect(isConfigurableAgentKind("brochure_send")).toBe(true);
    expect(isConfigurableAgentKind("follow_up_stale_lead")).toBe(true);
    expect(isConfigurableAgentKind("site_visit_booking")).toBe(false);
    expect(isConfigurableAgentKind("nonsense")).toBe(false);
  });

  it("isLockedAgentKind recognizes the locked kinds", () => {
    expect(isLockedAgentKind("site_visit_booking")).toBe(true);
    expect(isLockedAgentKind("brochure_send")).toBe(false);
  });

  it("locked and configurable kinds do not overlap", () => {
    for (const k of POLICY_CONFIGURABLE_AGENT_KINDS) {
      expect((LOCKED_AGENT_KINDS as readonly string[]).includes(k)).toBe(false);
    }
  });

  it("DEFAULT_SEND_POLICY is require_approval", () => {
    expect(DEFAULT_SEND_POLICY).toBe("require_approval");
  });
});
