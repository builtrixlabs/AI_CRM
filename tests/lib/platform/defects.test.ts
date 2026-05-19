import { describe, expect, it, vi } from "vitest";
import {
  createDefect,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  updateDefect,
  type DefectStatus,
} from "@/lib/platform/defects";

const USER = "11111111-2222-4333-8444-555555555555";

function makeInsertClient(opts: {
  insert_data?: { id: string };
  insert_error?: { message: string };
  update_data?: Array<{ id: string }>;
  update_error?: { message: string };
}) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  return {
    inserts,
    updates,
    client: {
      from: vi.fn(() => ({
        insert: vi.fn((row: unknown) => {
          inserts.push(row);
          return {
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: opts.insert_data ?? null,
                  error: opts.insert_error ?? null,
                }),
              ),
            })),
          };
        }),
        update: vi.fn((patch: unknown) => {
          updates.push(patch);
          const chain: Record<string, unknown> = {
            eq: vi.fn(() => chain),
            select: vi.fn(() =>
              Promise.resolve({
                data: opts.update_data ?? [],
                error: opts.update_error ?? null,
              }),
            ),
          };
          return chain;
        }),
      })),
    },
  };
}

describe("createDefect", () => {
  it("inserts a clean row + returns ok+id", async () => {
    const env = makeInsertClient({ insert_data: { id: "d-1" } });
    const r = await createDefect(
      {
        severity: "P1",
        title: "Brochure agent crashed",
        description: "Stack trace attached.",
        created_by: USER,
      },
      env.client as never,
    );
    expect(r).toEqual({ ok: true, id: "d-1" });
    const row = env.inserts[0] as Record<string, unknown>;
    expect(row.severity).toBe("P1");
    expect(row.title).toBe("Brochure agent crashed");
    expect(row.created_by).toBe(USER);
  });

  it("rejects an empty title or description (validation)", async () => {
    const env = makeInsertClient({});
    const r1 = await createDefect(
      {
        severity: "P2",
        title: "",
        description: "x",
        created_by: USER,
      },
      env.client as never,
    );
    expect(r1).toEqual({ ok: false, reason: "validation" });
    const r2 = await createDefect(
      {
        severity: "P2",
        title: "x",
        description: "   ",
        created_by: USER,
      },
      env.client as never,
    );
    expect(r2).toEqual({ ok: false, reason: "validation" });
  });

  it("rejects an unknown severity (validation, never hits DB)", async () => {
    const env = makeInsertClient({});
    const r = await createDefect(
      // @ts-expect-error — bad severity
      { severity: "P99", title: "x", description: "y", created_by: USER },
      env.client as never,
    );
    expect(r).toEqual({ ok: false, reason: "validation" });
    expect(env.inserts).toHaveLength(0);
  });
});

describe("updateDefect", () => {
  it("sets resolved_at when transitioning to a terminal status", async () => {
    const env = makeInsertClient({ update_data: [{ id: "d-1" }] });
    const r = await updateDefect(
      { id: "d-1", status: "resolved" },
      env.client as never,
    );
    expect(r).toEqual({ ok: true });
    const patch = env.updates[0] as { status: string; resolved_at: string | null };
    expect(patch.status).toBe("resolved");
    expect(typeof patch.resolved_at).toBe("string");
  });

  it("clears resolved_at when transitioning OUT of a terminal status", async () => {
    const env = makeInsertClient({ update_data: [{ id: "d-1" }] });
    await updateDefect(
      { id: "d-1", status: "in_progress" },
      env.client as never,
    );
    const patch = env.updates[0] as { status: string; resolved_at: string | null };
    expect(patch.status).toBe("in_progress");
    expect(patch.resolved_at).toBeNull();
  });

  it("returns 'not_found' when no row matched", async () => {
    const env = makeInsertClient({ update_data: [] });
    const r = await updateDefect(
      { id: "d-missing", status: "resolved" },
      env.client as never,
    );
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects unknown status / severity (validation, never hits DB)", async () => {
    const env = makeInsertClient({});
    const r1 = await updateDefect(
      // @ts-expect-error
      { id: "d-1", status: "bogus" },
      env.client as never,
    );
    expect(r1).toEqual({ ok: false, reason: "validation" });
    const r2 = await updateDefect(
      // @ts-expect-error
      { id: "d-1", severity: "PX" },
      env.client as never,
    );
    expect(r2).toEqual({ ok: false, reason: "validation" });
    expect(env.updates).toHaveLength(0);
  });
});

describe("catalogs", () => {
  it("DEFECT_SEVERITIES is the four-value PRD set", () => {
    expect(DEFECT_SEVERITIES).toEqual(["P0", "P1", "P2", "P3"]);
  });

  it("DEFECT_STATUSES is the five-value PRD set", () => {
    expect(DEFECT_STATUSES).toEqual([
      "open",
      "triaged",
      "in_progress",
      "resolved",
      "wont_fix",
    ] satisfies DefectStatus[]);
  });
});
