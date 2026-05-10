import { describe, expect, it, vi } from "vitest";
import { runAutoSuspendSweep } from "@/lib/platform/auto-suspend";

type Updates = Array<Record<string, unknown>>;

function makeClient(opts: {
  past_due: Array<{ organization_id: string; grace_period_until: string; status: string }>;
  failOnSubUpdate?: boolean;
  failOnRevocation?: boolean;
}) {
  const subUpdates: Updates = [];
  const revocations: Updates = [];
  const audits: Updates = [];

  return {
    state: { subUpdates, revocations, audits },
    from: vi.fn((table: string) => {
      if (table === "subscriptions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              lte: vi.fn(() => ({
                not: vi.fn(() => Promise.resolve({ data: opts.past_due, error: null })),
              })),
            })),
          })),
          update: vi.fn((row: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => {
                if (opts.failOnSubUpdate) return Promise.resolve({ error: { message: "boom-sub" } });
                subUpdates.push(row);
                return Promise.resolve({ error: null });
              }),
            })),
          })),
        };
      }
      if (table === "org_session_revocations") {
        return {
          upsert: vi.fn((row: Record<string, unknown>) => {
            if (opts.failOnRevocation) return Promise.resolve({ error: { message: "boom-rev" } });
            revocations.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === "audit_log") {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            audits.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })) };
    }),
  };
}

describe("auto-suspend.runAutoSuspendSweep", () => {
  it("transitions past_due rows whose grace expired -> suspended + revocation + audit", async () => {
    const client = makeClient({
      past_due: [
        { organization_id: "org-1", grace_period_until: "2026-04-01T00:00:00Z", status: "past_due" },
        { organization_id: "org-2", grace_period_until: "2026-04-15T00:00:00Z", status: "past_due" },
      ],
    });
    const summary = await runAutoSuspendSweep(client as never, new Date("2026-05-10T12:00:00Z"));
    expect(summary.scanned).toBe(2);
    expect(summary.suspended).toBe(2);
    expect(summary.errors).toEqual([]);
    expect(client.state.subUpdates).toHaveLength(2);
    expect(client.state.subUpdates[0]).toMatchObject({ status: "suspended" });
    expect(client.state.revocations).toHaveLength(2);
    expect(client.state.revocations[0]).toMatchObject({
      organization_id: "org-1",
      reason: "grace_period_expired",
    });
    expect(client.state.audits).toHaveLength(2);
    expect(client.state.audits[0]).toMatchObject({
      action: "auto_suspended_grace_expired",
    });
  });

  it("returns scanned=0 when nothing matches", async () => {
    const client = makeClient({ past_due: [] });
    const summary = await runAutoSuspendSweep(client as never);
    expect(summary).toEqual({ scanned: 0, suspended: 0, errors: [] });
    expect(client.state.subUpdates).toHaveLength(0);
  });

  it("captures errors in summary and continues with the next org", async () => {
    const client = makeClient({
      past_due: [
        { organization_id: "org-1", grace_period_until: "2026-01-01T00:00:00Z", status: "past_due" },
      ],
      failOnSubUpdate: true,
    });
    const summary = await runAutoSuspendSweep(client as never, new Date("2026-05-10T12:00:00Z"));
    expect(summary.scanned).toBe(1);
    expect(summary.suspended).toBe(0);
    expect(summary.errors).toEqual([{ organization_id: "org-1", error: "boom-sub" }]);
  });

  it("rolls back nothing on revocation failure but logs the error", async () => {
    const client = makeClient({
      past_due: [
        { organization_id: "org-1", grace_period_until: "2026-01-01T00:00:00Z", status: "past_due" },
      ],
      failOnRevocation: true,
    });
    const summary = await runAutoSuspendSweep(client as never, new Date("2026-05-10T12:00:00Z"));
    expect(summary.suspended).toBe(0);
    expect(summary.errors[0]).toEqual({ organization_id: "org-1", error: "boom-rev" });
  });
});
