import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyRecoveryReason,
  enqueueRecoveryCandidate,
  findRecoveryCandidates,
  runRecoverySweep,
  STALE_RECOVERY_DAYS,
  RECOVERY_REASONS,
  RECOVERY_RESOLUTIONS,
} from "@/lib/recovery";

const ORG = "11111111-2222-4333-8444-555555555555";

// Frozen "now" so day math is deterministic.
const NOW = new Date("2026-05-19T12:00:00.000Z");
const DAY = 86_400_000;

function daysAgoIso(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

describe("recovery types catalog", () => {
  it("RECOVERY_REASONS is exactly the four PRD values (pinned against migration CHECK)", () => {
    expect(RECOVERY_REASONS).toEqual([
      "lost",
      "on_hold",
      "stale_contacted",
      "stale_qualified",
    ]);
  });

  it("RECOVERY_RESOLUTIONS is exactly the three closed values", () => {
    expect(RECOVERY_RESOLUTIONS).toEqual([
      "won_back",
      "unreachable",
      "confirmed_lost",
    ]);
  });

  it("STALE_RECOVERY_DAYS is 14 (D-322 covers 7-14; D-616 picks up at 14+)", () => {
    expect(STALE_RECOVERY_DAYS).toBe(14);
  });
});

describe("classifyRecoveryReason", () => {
  it("returns 'lost' for state='lost' regardless of contact age", () => {
    expect(
      classifyRecoveryReason(
        { state: "lost", created_at: daysAgoIso(1), updated_at: null, data: {} },
        NOW,
      ),
    ).toBe("lost");
  });

  it("returns 'on_hold' for state='on_hold' regardless of contact age", () => {
    expect(
      classifyRecoveryReason(
        { state: "on_hold", created_at: daysAgoIso(1), updated_at: null, data: {} },
        NOW,
      ),
    ).toBe("on_hold");
  });

  it("returns 'stale_contacted' for state='contacted' + last contact >= 14d ago", () => {
    expect(
      classifyRecoveryReason(
        {
          state: "contacted",
          created_at: daysAgoIso(30),
          updated_at: daysAgoIso(30),
          data: { last_contact_at: daysAgoIso(15) },
        },
        NOW,
      ),
    ).toBe("stale_contacted");
  });

  it("returns 'stale_qualified' for state='qualified' + last contact >= 14d ago", () => {
    expect(
      classifyRecoveryReason(
        {
          state: "qualified",
          created_at: daysAgoIso(30),
          updated_at: daysAgoIso(30),
          data: { last_contact_at: daysAgoIso(20) },
        },
        NOW,
      ),
    ).toBe("stale_qualified");
  });

  it("returns null for state='contacted' with recent contact (<14d)", () => {
    expect(
      classifyRecoveryReason(
        {
          state: "contacted",
          created_at: daysAgoIso(30),
          updated_at: daysAgoIso(30),
          data: { last_contact_at: daysAgoIso(7) },
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("falls back to updated_at, then created_at, when last_contact_at missing", () => {
    expect(
      classifyRecoveryReason(
        {
          state: "contacted",
          created_at: daysAgoIso(30),
          updated_at: daysAgoIso(20),
          data: {},
        },
        NOW,
      ),
    ).toBe("stale_contacted");
    expect(
      classifyRecoveryReason(
        {
          state: "qualified",
          created_at: daysAgoIso(20),
          updated_at: null,
          data: null,
        },
        NOW,
      ),
    ).toBe("stale_qualified");
  });

  it("returns null for excluded states (new, junk, null)", () => {
    for (const state of ["new", "junk", null] as const) {
      expect(
        classifyRecoveryReason(
          { state, created_at: daysAgoIso(30), updated_at: null, data: {} },
          NOW,
        ),
      ).toBeNull();
    }
  });
});

describe("findRecoveryCandidates", () => {
  function makeClient(opts: { leads: unknown[]; open: unknown[] }) {
    const leadsChain = {
      select: vi.fn(() => leadsChain),
      eq: vi.fn(() => leadsChain),
      in: vi.fn(() => leadsChain),
      is: vi.fn(() => leadsChain),
      limit: vi.fn(() => Promise.resolve({ data: opts.leads, error: null })),
    };
    const openChain = {
      select: vi.fn(() => openChain),
      eq: vi.fn(() => openChain),
      is: vi.fn(() => openChain),
      in: vi.fn(() => Promise.resolve({ data: opts.open, error: null })),
    };
    let call = 0;
    return {
      from: vi.fn((tbl: string) => {
        if (tbl === "nodes") return leadsChain;
        if (tbl === "customer_recovery_queue") {
          call += 1;
          return openChain;
        }
        throw new Error(`unexpected table ${tbl} (call ${call})`);
      }),
    };
  }

  it("classifies + dedups against open queue rows", async () => {
    const client = makeClient({
      leads: [
        {
          id: "lead-lost",
          organization_id: ORG,
          state: "lost",
          created_at: daysAgoIso(2),
          updated_at: null,
          data: {},
        },
        {
          id: "lead-stale",
          organization_id: ORG,
          state: "contacted",
          created_at: daysAgoIso(40),
          updated_at: null,
          data: { last_contact_at: daysAgoIso(20) },
        },
        {
          id: "lead-fresh",
          organization_id: ORG,
          state: "contacted",
          created_at: daysAgoIso(40),
          updated_at: null,
          data: { last_contact_at: daysAgoIso(2) },
        },
      ],
      open: [{ lead_id: "lead-lost" }], // already queued
    });
    const r = await findRecoveryCandidates(ORG, client as never, NOW);
    expect(r).toEqual([
      {
        lead_id: "lead-stale",
        organization_id: ORG,
        recovery_reason: "stale_contacted",
      },
    ]);
  });

  it("returns empty when no leads qualify", async () => {
    const client = makeClient({ leads: [], open: [] });
    const r = await findRecoveryCandidates(ORG, client as never, NOW);
    expect(r).toEqual([]);
  });
});

describe("enqueueRecoveryCandidate", () => {
  function makeInsertClient(opts: {
    insert_error?: { code?: string; message?: string };
  }) {
    return {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: opts.insert_error ? null : { id: "q-1" },
                error: opts.insert_error ?? null,
              }),
            ),
          })),
        })),
      })),
    };
  }

  it("returns ok+queue_id on a clean insert", async () => {
    const client = makeInsertClient({});
    const r = await enqueueRecoveryCandidate(
      { lead_id: "L", organization_id: ORG, recovery_reason: "lost" },
      client as never,
    );
    expect(r).toEqual({ ok: true, queue_id: "q-1" });
  });

  it("returns 'already_queued' on 23505 (partial-unique conflict)", async () => {
    const client = makeInsertClient({
      insert_error: { code: "23505", message: "duplicate" },
    });
    const r = await enqueueRecoveryCandidate(
      { lead_id: "L", organization_id: ORG, recovery_reason: "lost" },
      client as never,
    );
    expect(r).toEqual({ ok: false, error: "already_queued" });
  });

  it("returns the DB message on other errors", async () => {
    const client = makeInsertClient({
      insert_error: { code: "00000", message: "kaboom" },
    });
    const r = await enqueueRecoveryCandidate(
      { lead_id: "L", organization_id: ORG, recovery_reason: "lost" },
      client as never,
    );
    expect(r).toEqual({ ok: false, error: "kaboom" });
  });
});

describe("runRecoverySweep", () => {
  function makeSweepClient(orgs: string[], throwForOrg?: string) {
    const orgsChain = {
      select: vi.fn(() => orgsChain),
      is: vi.fn(() => Promise.resolve({ data: orgs.map((id) => ({ id })), error: null })),
    };
    const leadsChain = {
      select: vi.fn(() => leadsChain),
      eq: vi.fn((_col?: string, val?: string) => {
        if (val === throwForOrg) throw new Error("synthetic org failure");
        return leadsChain;
      }),
      in: vi.fn(() => leadsChain),
      is: vi.fn(() => leadsChain),
      limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };
    return {
      from: vi.fn((tbl: string) => {
        if (tbl === "organizations") return orgsChain;
        if (tbl === "nodes") return leadsChain;
        throw new Error(`unexpected table ${tbl}`);
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scans all orgs and returns summary counters", async () => {
    const client = makeSweepClient(["o1", "o2", "o3"]);
    const r = await runRecoverySweep(client as never);
    expect(r.orgs_scanned).toBe(3);
    expect(r.rows_enqueued).toBe(0);
    expect(r.skipped_dup).toBe(0);
    expect(r.org_errors).toBe(0);
  });

  it("isolates per-org failures via the try/catch (one bad org never blocks others)", async () => {
    const client = makeSweepClient(["o1", "bad", "o3"], "bad");
    const r = await runRecoverySweep(client as never);
    expect(r.orgs_scanned).toBe(3);
    expect(r.org_errors).toBe(1);
  });
});
