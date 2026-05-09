import { describe, expect, it, vi } from "vitest";
import { requestPlanUpgrade } from "@/lib/admin/billing";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "99999999-8888-4777-8666-555555555555";

function makeWriteClient(opts: { insert_error?: boolean } = {}) {
  const inserts: unknown[] = [];
  const audits: unknown[] = [];
  const ticketsChain = {
    insert: vi.fn((row: unknown) => {
      inserts.push(row);
      return Object.assign(ticketsChain, {
        select: vi.fn(() => ticketsChain),
        single: vi.fn(() =>
          Promise.resolve({
            data: opts.insert_error ? null : { id: "ticket-x" },
            error: opts.insert_error ? new Error("db") : null,
          })
        ),
      });
    }),
  };
  const auditChain = {
    insert: vi.fn((row: unknown) => {
      audits.push(row);
      return Promise.resolve({ error: null });
    }),
  };
  return {
    inserts,
    audits,
    client: {
      from: vi.fn((t: string) => {
        if (t === "support_tickets") return ticketsChain;
        if (t === "audit_log") return auditChain;
        throw new Error(`unexpected ${t}`);
      }),
    },
  };
}

describe("requestPlanUpgrade", () => {
  it("creates ticket + audit with kind=plan_upgrade_request", async () => {
    const env = makeWriteClient();
    const r = await requestPlanUpgrade(
      {
        organization_id: ORG,
        user_id: USER,
        target_tier: "professional",
        reason: "Crossed 5 active users; need bigger plan.",
      },
      env.client as never
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ticket_id).toBe("ticket-x");
    expect(env.inserts).toHaveLength(1);
    const t = env.inserts[0] as Record<string, unknown>;
    expect(t.kind).toBe("plan_upgrade_request");
    expect(t.subject).toContain("professional");
    expect((env.audits[0] as { action: string }).action).toBe(
      "plan_upgrade_requested"
    );
  });

  it("rejects invalid tier", async () => {
    const env = makeWriteClient();
    const r = await requestPlanUpgrade(
      {
        organization_id: ORG,
        user_id: USER,
        target_tier: "free" as never,
        reason: "x",
      },
      env.client as never
    );
    expect(r.ok).toBe(false);
    expect(env.inserts).toHaveLength(0);
  });

  it("rejects empty reason", async () => {
    const env = makeWriteClient();
    const r = await requestPlanUpgrade(
      {
        organization_id: ORG,
        user_id: USER,
        target_tier: "professional",
        reason: "",
      },
      env.client as never
    );
    expect(r.ok).toBe(false);
    expect(env.inserts).toHaveLength(0);
  });

  it("propagates db errors", async () => {
    const env = makeWriteClient({ insert_error: true });
    const r = await requestPlanUpgrade(
      {
        organization_id: ORG,
        user_id: USER,
        target_tier: "professional",
        reason: "Need more seats",
      },
      env.client as never
    );
    expect(r.ok).toBe(false);
  });
});
