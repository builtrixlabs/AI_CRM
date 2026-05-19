import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimRecoveryItem,
  listRecoveryQueue,
  resolveRecoveryItem,
} from "@/lib/recovery";

const ORG = "11111111-2222-4333-8444-555555555555";
const USER = "22222222-3333-4444-8555-666666666666";
const QUEUE_ID = "33333333-4444-4555-8666-777777777777";
const LEAD_ID = "44444444-5555-4666-8777-888888888888";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listRecoveryQueue", () => {
  type Row = Record<string, unknown>;
  function makeClient(opts: { queue: Row[]; leads: Row[] }) {
    const qChain: Record<string, unknown> = {
      select: vi.fn(() => qChain),
      eq: vi.fn(() => qChain),
      is: vi.fn(() => qChain),
      not: vi.fn(() => qChain),
      gte: vi.fn(() => qChain),
      order: vi.fn(() => qChain),
      limit: vi.fn(() => Promise.resolve({ data: opts.queue, error: null })),
    };
    const lChain: Record<string, unknown> = {
      select: vi.fn(() => lChain),
      eq: vi.fn(() => lChain),
      in: vi.fn(() => Promise.resolve({ data: opts.leads, error: null })),
    };
    return {
      from: vi.fn((tbl: string) => {
        if (tbl === "customer_recovery_queue") return qChain;
        if (tbl === "nodes") return lChain;
        throw new Error(`unexpected table ${tbl}`);
      }),
    };
  }

  it("returns the queue rows joined with lead label + state", async () => {
    const client = makeClient({
      queue: [
        {
          id: QUEUE_ID,
          organization_id: ORG,
          lead_id: LEAD_ID,
          recovery_reason: "lost",
          added_at: "2026-05-19T10:00:00.000Z",
          claimed_by: null,
          claimed_at: null,
          resolved_at: null,
          resolution: null,
          note: null,
        },
      ],
      leads: [{ id: LEAD_ID, label: "Riya Sharma", state: "lost" }],
    });
    const rows = await listRecoveryQueue({
      organization_id: ORG,
      viewer_id: USER,
      filters: { bucket: "open" },
      client: client as never,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].lead_label).toBe("Riya Sharma");
    expect(rows[0].lead_state).toBe("lost");
    expect(rows[0].recovery_reason).toBe("lost");
  });

  it("returns [] cleanly when the queue is empty (no lead fetch)", async () => {
    const client = makeClient({ queue: [], leads: [] });
    const rows = await listRecoveryQueue({
      organization_id: ORG,
      viewer_id: USER,
      filters: { bucket: "open" },
      client: client as never,
    });
    expect(rows).toEqual([]);
  });
});

describe("claimRecoveryItem", () => {
  function makeUpdateClient(opts: {
    updated_rows: { id: string }[];
    update_error?: { message: string };
    existing?: { claimed_by: string | null; resolved_at: string | null } | null;
  }) {
    const updateChain: Record<string, unknown> = {
      update: vi.fn(() => updateChain),
      eq: vi.fn(() => updateChain),
      is: vi.fn(() => updateChain),
      select: vi.fn(() =>
        Promise.resolve({
          data: opts.update_error ? null : opts.updated_rows,
          error: opts.update_error ?? null,
        }),
      ),
    };
    const readChain: Record<string, unknown> = {
      select: vi.fn(() => readChain),
      eq: vi.fn(() => readChain),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: opts.existing ?? null, error: null }),
      ),
    };
    let fromCall = 0;
    return {
      from: vi.fn(() => {
        fromCall += 1;
        return fromCall === 1 ? updateChain : readChain;
      }),
    };
  }

  it("succeeds when the conditional UPDATE affects a row", async () => {
    const client = makeUpdateClient({ updated_rows: [{ id: QUEUE_ID }] });
    const r = await claimRecoveryItem({
      organization_id: ORG,
      queue_id: QUEUE_ID,
      user_id: USER,
      client: client as never,
    });
    expect(r).toEqual({ ok: true });
  });

  it("returns 'already_claimed' when existing row is claimed by someone else", async () => {
    const client = makeUpdateClient({
      updated_rows: [],
      existing: { claimed_by: "other", resolved_at: null },
    });
    const r = await claimRecoveryItem({
      organization_id: ORG,
      queue_id: QUEUE_ID,
      user_id: USER,
      client: client as never,
    });
    expect(r).toEqual({ ok: false, reason: "already_claimed" });
  });

  it("returns 'resolved' when existing row is already resolved", async () => {
    const client = makeUpdateClient({
      updated_rows: [],
      existing: { claimed_by: null, resolved_at: "2026-05-18T00:00:00Z" },
    });
    const r = await claimRecoveryItem({
      organization_id: ORG,
      queue_id: QUEUE_ID,
      user_id: USER,
      client: client as never,
    });
    expect(r).toEqual({ ok: false, reason: "resolved" });
  });

  it("returns 'not_found' when no existing row", async () => {
    const client = makeUpdateClient({ updated_rows: [], existing: null });
    const r = await claimRecoveryItem({
      organization_id: ORG,
      queue_id: QUEUE_ID,
      user_id: USER,
      client: client as never,
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("propagates the DB error message on a non-conflict failure", async () => {
    const client = makeUpdateClient({
      updated_rows: [],
      update_error: { message: "permission denied" },
    });
    const r = await claimRecoveryItem({
      organization_id: ORG,
      queue_id: QUEUE_ID,
      user_id: USER,
      client: client as never,
    });
    expect(r).toEqual({ ok: false, reason: "permission denied" });
  });
});

describe("resolveRecoveryItem", () => {
  type Row = { id: string; lead_id: string };
  function makeResolveClient(opts: {
    updated_rows: Row[];
    audit_inserts?: unknown[];
    existing?: { resolved_at: string | null } | null;
  }) {
    const audit = opts.audit_inserts ?? [];
    const updateChain: Record<string, unknown> = {
      update: vi.fn(() => updateChain),
      eq: vi.fn(() => updateChain),
      is: vi.fn(() => updateChain),
      select: vi.fn(() =>
        Promise.resolve({ data: opts.updated_rows, error: null }),
      ),
    };
    const readChain: Record<string, unknown> = {
      select: vi.fn(() => readChain),
      eq: vi.fn(() => readChain),
      maybeSingle: vi.fn(() =>
        Promise.resolve({ data: opts.existing ?? null, error: null }),
      ),
    };
    const auditChain = {
      insert: vi.fn((row: unknown) => {
        audit.push(row);
        return Promise.resolve({ data: null, error: null });
      }),
    };
    let fromCalls = 0;
    return {
      audit,
      client: {
        from: vi.fn((tbl: string) => {
          fromCalls += 1;
          if (tbl === "customer_recovery_queue") {
            return opts.updated_rows.length === 0 && fromCalls > 1
              ? readChain
              : updateChain;
          }
          if (tbl === "audit_log") return auditChain;
          throw new Error(`unexpected table ${tbl}`);
        }),
      },
    };
  }

  it("succeeds + writes an audit row when the conditional UPDATE hits", async () => {
    const env = makeResolveClient({
      updated_rows: [{ id: QUEUE_ID, lead_id: LEAD_ID }],
    });
    const r = await resolveRecoveryItem({
      organization_id: ORG,
      queue_id: QUEUE_ID,
      user_id: USER,
      resolution: "won_back",
      client: env.client as never,
    });
    expect(r).toEqual({ ok: true });
    expect(env.audit).toHaveLength(1);
    const a = env.audit[0] as {
      action: string;
      diff: { resolution: string };
      table_name: string;
    };
    expect(a.action).toBe("recovery_resolved");
    expect(a.diff.resolution).toBe("won_back");
    expect(a.table_name).toBe("customer_recovery_queue");
  });

  it("rejects an unknown resolution before touching the DB", async () => {
    const env = makeResolveClient({ updated_rows: [] });
    const r = await resolveRecoveryItem({
      organization_id: ORG,
      queue_id: QUEUE_ID,
      user_id: USER,
      // @ts-expect-error — bad value
      resolution: "boom",
      client: env.client as never,
    });
    expect(r).toEqual({ ok: false, reason: "invalid_resolution" });
  });

  it("returns 'already_resolved' when the row is already closed", async () => {
    const env = makeResolveClient({
      updated_rows: [],
      existing: { resolved_at: "2026-05-18T00:00:00Z" },
    });
    const r = await resolveRecoveryItem({
      organization_id: ORG,
      queue_id: QUEUE_ID,
      user_id: USER,
      resolution: "won_back",
      client: env.client as never,
    });
    expect(r).toEqual({ ok: false, reason: "already_resolved" });
  });

  it("returns 'not_found' when no existing row", async () => {
    const env = makeResolveClient({ updated_rows: [], existing: null });
    const r = await resolveRecoveryItem({
      organization_id: ORG,
      queue_id: QUEUE_ID,
      user_id: USER,
      resolution: "won_back",
      client: env.client as never,
    });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
});
