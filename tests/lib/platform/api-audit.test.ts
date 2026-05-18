import { describe, expect, it, vi } from "vitest";
import { listApiAudit, recordApiAudit } from "@/lib/platform/api-audit";

const ORG = "11111111-2222-4333-8444-555555555555";

describe("recordApiAudit", () => {
  it("inserts a row with provided fields", async () => {
    const inserts: unknown[] = [];
    const client = {
      from: vi.fn(() => ({
        insert: vi.fn((row: unknown) => {
          inserts.push(row);
          return Promise.resolve({ error: null });
        }),
      })),
    };
    await recordApiAudit(
      {
        method: "POST",
        path: "/api/events/inbox",
        status_code: 200,
        organization_id: ORG,
        latency_ms: 42,
        permission_checked: "events.inbox.write",
      },
      client as never
    );
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.method).toBe("POST");
    expect(row.path).toBe("/api/events/inbox");
    expect(row.status_code).toBe(200);
    expect(row.organization_id).toBe(ORG);
    expect(row.latency_ms).toBe(42);
    expect(row.permission_checked).toBe("events.inbox.write");
  });

  it("does not throw on insert error (audit must not break the request)", async () => {
    const client = {
      from: vi.fn(() => ({
        insert: vi.fn(() =>
          Promise.reject(new Error("db down"))
        ),
      })),
    };
    await expect(
      recordApiAudit(
        { method: "GET", path: "/x", status_code: 500 },
        client as never
      )
    ).resolves.toBeUndefined();
  });

  it("defaults missing optional fields to null", async () => {
    const inserts: unknown[] = [];
    const client = {
      from: vi.fn(() => ({
        insert: vi.fn((row: unknown) => {
          inserts.push(row);
          return Promise.resolve({ error: null });
        }),
      })),
    };
    await recordApiAudit(
      { method: "GET", path: "/health", status_code: 200 },
      client as never
    );
    const row = inserts[0] as Record<string, unknown>;
    expect(row.user_id).toBeNull();
    expect(row.organization_id).toBeNull();
    expect(row.ip).toBeNull();
    expect(row.permission_checked).toBeNull();
  });
});

describe("listApiAudit", () => {
  function makeChain(rows: unknown[]) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
    };
    return chain;
  }

  it("applies filters and respects limit", async () => {
    const chain = makeChain([
      { id: "1", ts: "2026-05-09T00:00:00Z", method: "GET", path: "/x", status_code: 200 },
    ]);
    const client = { from: vi.fn(() => chain) };
    const out = await listApiAudit(
      { organization_id: ORG, status_min: 400, from_ts: "2026-05-01T00:00:00Z" },
      50,
      client as never
    );
    expect(out).toHaveLength(1);
    expect(chain.eq).toHaveBeenCalledWith("organization_id", ORG);
    expect(chain.gte).toHaveBeenCalledWith("status_code", 400);
    expect(chain.gte).toHaveBeenCalledWith("ts", "2026-05-01T00:00:00Z");
    expect(chain.limit).toHaveBeenCalledWith(50);
  });

  it("returns empty array on db error", async () => {
    const chain = {
      select: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve({ data: null, error: new Error("x") })),
    };
    const client = { from: vi.fn(() => chain) };
    const out = await listApiAudit({}, 10, client as never);
    expect(out).toEqual([]);
  });
});
