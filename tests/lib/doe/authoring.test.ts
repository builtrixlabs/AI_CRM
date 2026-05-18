import { describe, expect, it, vi } from "vitest";
import {
  createCustomDirective,
  createDirectiveInputSchema,
  defaultTierForAction,
  DirectiveAuthoringError,
  listEffectiveDirectives,
  listRecentInvocations,
  nextCustomCode,
  toggleDirective,
  toggleDirectiveInputSchema,
} from "@/lib/doe/authoring";
import type { DirectiveRow } from "@/lib/doe/types";

const ORG_A = "11111111-2222-4333-8444-555555555555";
const ORG_B = "22222222-3333-4444-8555-666666666666";
const ACTOR = "33333333-4444-4555-8666-777777777777";

function platformRow(over: Partial<DirectiveRow> = {}): DirectiveRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    organization_id: null,
    code: "D-09",
    display_name: "Call objection: price → playbook",
    trigger_kind: "call.objection_detected",
    trigger_config: {},
    action_kind: "surface_on_canvas",
    action_config: {},
    tier: "T0",
    enabled: true,
    ...over,
  };
}

function orgRow(over: Partial<DirectiveRow> = {}): DirectiveRow {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    organization_id: ORG_A,
    code: "C-01",
    display_name: "Custom rule",
    trigger_kind: "lead.created",
    trigger_config: {},
    action_kind: "flag_lead",
    action_config: {},
    tier: "T1",
    enabled: true,
    ...over,
  };
}

type Inserts = {
  directives: Array<Record<string, unknown>>;
  audit_log: Array<Record<string, unknown>>;
};

type Updates = Array<{ table: string; payload: Record<string, unknown>; filter: Record<string, unknown> }>;

/**
 * Hand-rolled Supabase client mock — same shape as the existing
 * tests/lib/doe/runtime.test.ts mock so reviewers see one pattern.
 */
function makeClient(opts: {
  org_rows?: DirectiveRow[];
  platform_rows?: DirectiveRow[];
  recent_invocations?: Array<Record<string, unknown>>;
  insert_id?: string;
  insert_error?: string;
  update_error?: string;
}) {
  const inserts: Inserts = { directives: [], audit_log: [] };
  const updates: Updates = [];

  function fromHandler(table: string) {
    if (table === "directives") {
      return {
        select: (_cols?: string) => {
          const filters: Record<string, unknown> = {};
          const queryChain: Record<string, unknown> = {};
          queryChain.eq = (key: string, val: unknown) => {
            filters[key] = val;
            return queryChain;
          };
          queryChain.is = (key: string, val: unknown) => {
            filters[`${key}_is`] = val;
            return queryChain;
          };
          queryChain.like = (key: string, val: unknown) => {
            filters[`${key}_like`] = val;
            return queryChain;
          };
          queryChain.or = (_clause: string) => {
            filters.__or = _clause;
            return queryChain;
          };
          queryChain.order = (_k: string, _opts: unknown) => queryChain;
          queryChain.limit = (_n: number) => queryChain;
          queryChain.maybeSingle = () => {
            // Return appropriate row based on filters.
            const orgFilter = filters.organization_id;
            const codeFilter = filters.code;
            if (orgFilter == null && filters.organization_id_is === null) {
              const r = (opts.platform_rows ?? []).find(
                (x) => x.code === codeFilter,
              );
              return Promise.resolve({ data: r ?? null, error: null });
            }
            if (typeof orgFilter === "string") {
              const r = (opts.org_rows ?? []).find(
                (x) =>
                  x.organization_id === orgFilter && x.code === codeFilter,
              );
              return Promise.resolve({ data: r ?? null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          };
          queryChain.single = () => {
            // Insert path returns { data: { id } }.
            return Promise.resolve({
              data: { id: opts.insert_id ?? "new-id" },
              error: opts.insert_error ? { message: opts.insert_error } : null,
            });
          };
          // Terminal for nextCustomCode (no maybeSingle, just await chain).
          // The like-based call resolves to data array.
          // We make queryChain itself thenable so `await client.from(...).select().eq().like()` works.
          (queryChain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            // listEffectiveDirectives now does two parallel queries:
            //   .is("organization_id", null)  — platform defaults
            //   .eq("organization_id", X)     — own org rows
            if (filters.organization_id_is === null) {
              return Promise.resolve({
                data: opts.platform_rows ?? [],
                error: null,
              }).then(resolve);
            }
            if (
              typeof filters.organization_id === "string" &&
              filters.code_like == null &&
              filters.code == null
            ) {
              const matched = (opts.org_rows ?? []).filter(
                (r) => r.organization_id === filters.organization_id,
              );
              return Promise.resolve({ data: matched, error: null }).then(
                resolve,
              );
            }
            // Legacy .or() path retained for backwards compatibility (unused).
            if (filters.__or) {
              const all = [
                ...(opts.platform_rows ?? []),
                ...(opts.org_rows ?? []),
              ];
              return Promise.resolve({ data: all, error: null }).then(resolve);
            }
            // nextCustomCode uses `.eq("organization_id", X).like("code", "C-%")`
            if (filters.code_like === "C-%") {
              const matched = (opts.org_rows ?? [])
                .filter(
                  (r) =>
                    r.organization_id === filters.organization_id &&
                    r.code.startsWith("C-"),
                )
                .map((r) => ({ code: r.code }));
              return Promise.resolve({ data: matched, error: null }).then(
                resolve,
              );
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          };
          return queryChain;
        },
        insert: (payload: Record<string, unknown>) => {
          inserts.directives.push(payload);
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: opts.insert_id ?? "new-id" },
                  error: opts.insert_error ? { message: opts.insert_error } : null,
                }),
            }),
          };
        },
        update: (payload: Record<string, unknown>) => {
          const filter: Record<string, unknown> = {};
          const ret: Record<string, unknown> = {};
          ret.eq = (k: string, v: unknown) => {
            filter[k] = v;
            return ret;
          };
          (ret as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) => {
            updates.push({ table, payload, filter });
            return Promise.resolve({
              error: opts.update_error ? { message: opts.update_error } : null,
            }).then(resolve);
          };
          return ret;
        },
      };
    }
    if (table === "audit_log") {
      return {
        insert: (payload: Record<string, unknown>) => {
          inserts.audit_log.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === "directive_invocations") {
      return {
        select: (_cols?: string) => {
          const queryChain: Record<string, unknown> = {};
          queryChain.eq = () => queryChain;
          queryChain.order = () => queryChain;
          queryChain.limit = () => queryChain;
          (queryChain as unknown as PromiseLike<unknown>).then = (
            resolve: (v: unknown) => unknown,
          ) =>
            Promise.resolve({
              data: opts.recent_invocations ?? [],
              error: null,
            }).then(resolve);
          return queryChain;
        },
      };
    }
    throw new Error(`unhandled table: ${table}`);
  }

  return {
    inserts,
    updates,
    client: { from: vi.fn(fromHandler) } as unknown as Parameters<
      typeof toggleDirective
    >[1],
  };
}

describe("defaultTierForAction", () => {
  it("returns T0 for surface_on_canvas / notify_user", () => {
    expect(defaultTierForAction("surface_on_canvas")).toBe("T0");
    expect(defaultTierForAction("notify_user")).toBe("T0");
  });

  it("returns T1 for flag_lead / attach_node / enqueue_agent", () => {
    expect(defaultTierForAction("flag_lead")).toBe("T1");
    expect(defaultTierForAction("attach_node")).toBe("T1");
    expect(defaultTierForAction("enqueue_agent")).toBe("T1");
  });

  it("returns T2 for send_template_message", () => {
    expect(defaultTierForAction("send_template_message")).toBe("T2");
  });
});

describe("createDirectiveInputSchema", () => {
  it("accepts a minimal valid input", () => {
    const result = createDirectiveInputSchema.safeParse({
      display_name: "Notify rep on hot lead",
      trigger_kind: "lead.intent_crossed",
      action_kind: "notify_user",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty display_name", () => {
    const result = createDirectiveInputSchema.safeParse({
      display_name: "",
      trigger_kind: "lead.created",
      action_kind: "flag_lead",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown trigger_kind", () => {
    const result = createDirectiveInputSchema.safeParse({
      display_name: "x",
      trigger_kind: "lead.unknown",
      action_kind: "flag_lead",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown extra fields (strict)", () => {
    const result = createDirectiveInputSchema.safeParse({
      display_name: "x",
      trigger_kind: "lead.created",
      action_kind: "flag_lead",
      hacker_field: "boom",
    });
    expect(result.success).toBe(false);
  });
});

describe("toggleDirectiveInputSchema", () => {
  it("requires code + enabled", () => {
    expect(
      toggleDirectiveInputSchema.safeParse({ code: "D-09", enabled: false }).success,
    ).toBe(true);
    expect(toggleDirectiveInputSchema.safeParse({ code: "D-09" }).success).toBe(
      false,
    );
    expect(
      toggleDirectiveInputSchema.safeParse({ code: "", enabled: true }).success,
    ).toBe(false);
  });
});

describe("nextCustomCode", () => {
  it("returns C-01 for an org with no custom rows", async () => {
    const m = makeClient({ org_rows: [] });
    const code = await nextCustomCode(ORG_A, m.client);
    expect(code).toBe("C-01");
  });

  it("returns C-02 after one custom directive", async () => {
    const m = makeClient({
      org_rows: [orgRow({ code: "C-01" })],
    });
    const code = await nextCustomCode(ORG_A, m.client);
    expect(code).toBe("C-02");
  });

  it("returns C-04 when codes have a gap (no slot reuse)", async () => {
    const m = makeClient({
      org_rows: [
        orgRow({ id: "a", code: "C-01" }),
        orgRow({ id: "c", code: "C-03" }),
      ],
    });
    const code = await nextCustomCode(ORG_A, m.client);
    expect(code).toBe("C-04");
  });

  it("ignores codes from other orgs (mock-level isolation)", async () => {
    const m = makeClient({
      org_rows: [
        orgRow({ id: "a", code: "C-01", organization_id: ORG_A }),
        orgRow({ id: "b", code: "C-99", organization_id: ORG_B }),
      ],
    });
    // The query filters by organization_id, so only ORG_A's rows count.
    const code = await nextCustomCode(ORG_A, m.client);
    expect(code).toBe("C-02");
  });
});

describe("toggleDirective", () => {
  it("UPDATEs in place when an org-specific row exists", async () => {
    const existing = orgRow({
      code: "D-09",
      enabled: true,
      organization_id: ORG_A,
    });
    const m = makeClient({ org_rows: [existing] });

    const result = await toggleDirective(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        code: "D-09",
        enabled: false,
      },
      m.client,
    );

    expect(result.enabled).toBe(false);
    expect(result.code).toBe("D-09");
    expect(m.updates.length).toBe(1);
    const upd = m.updates[0];
    expect(upd.payload.enabled).toBe(false);
    expect(upd.payload.updated_by).toBe(ACTOR);
    expect(upd.filter.organization_id).toBe(ORG_A);
    expect(m.inserts.audit_log.length).toBe(1);
    expect(m.inserts.audit_log[0].action).toBe("directive_toggled");
    expect(m.inserts.audit_log[0].diff).toMatchObject({
      code: "D-09",
      from: true,
      to: false,
    });
  });

  it("UPSERTs an override row when only a platform default exists", async () => {
    const platform = platformRow({ code: "D-09", enabled: true });
    const m = makeClient({
      org_rows: [],
      platform_rows: [platform],
      insert_id: "override-uuid",
    });

    const result = await toggleDirective(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        code: "D-09",
        enabled: false,
      },
      m.client,
    );

    expect(result.id).toBe("override-uuid");
    expect(result.enabled).toBe(false);
    expect(m.inserts.directives.length).toBe(1);
    const insertedDirective = m.inserts.directives[0];
    expect(insertedDirective.organization_id).toBe(ORG_A);
    expect(insertedDirective.code).toBe("D-09");
    expect(insertedDirective.enabled).toBe(false);
    expect(insertedDirective.trigger_kind).toBe("call.objection_detected");
    expect(m.inserts.audit_log.length).toBe(1);
    expect(m.inserts.audit_log[0].diff).toMatchObject({
      origin: "override_inserted",
    });
  });

  it("throws not_found when neither own nor platform-default row exists", async () => {
    const m = makeClient({ org_rows: [], platform_rows: [] });

    await expect(
      toggleDirective(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          code: "D-99",
          enabled: false,
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(DirectiveAuthoringError);
  });

  it("does not mutate another org's row (cross-tenant guard)", async () => {
    // ORG_B has a row with code D-09; ORG_A toggles "D-09" — should fall
    // through to the platform-default lookup (none seeded) and throw.
    const m = makeClient({
      org_rows: [orgRow({ code: "D-09", organization_id: ORG_B })],
      platform_rows: [],
    });

    await expect(
      toggleDirective(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          code: "D-09",
          enabled: false,
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(DirectiveAuthoringError);
    expect(m.updates.length).toBe(0);
    expect(m.inserts.directives.length).toBe(0);
  });
});

describe("createCustomDirective", () => {
  it("inserts with auto-generated code C-01 + audit row", async () => {
    const m = makeClient({ org_rows: [], insert_id: "new-uuid" });

    const result = await createCustomDirective(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          display_name: "Notify on hot lead",
          trigger_kind: "lead.intent_crossed",
          trigger_config: { threshold: 80 },
          action_kind: "notify_user",
          action_config: { audience: "rep" },
          enabled: true,
        },
      },
      m.client,
    );

    expect(result).toEqual({
      id: "new-uuid",
      code: "C-01",
      lifecycle_status: "live",
    });
    expect(m.inserts.directives.length).toBe(1);
    const inserted = m.inserts.directives[0];
    expect(inserted.code).toBe("C-01");
    expect(inserted.organization_id).toBe(ORG_A);
    expect(inserted.tier).toBe("T0"); // default for notify_user
    expect(inserted.created_by).toBe(ACTOR);
    expect(m.inserts.audit_log[0].action).toBe("directive_created");
  });

  // ── D-615 lifecycle ──────────────────────────────────────────────────
  it("an org_admin-authored workflow lands live + enabled (AC-2)", async () => {
    const m = makeClient({ org_rows: [], insert_id: "live-uuid" });
    const result = await createCustomDirective(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          display_name: "Org admin workflow",
          trigger_kind: "lead.created",
          trigger_config: {},
          action_kind: "flag_lead",
          action_config: {},
          enabled: true,
        },
      },
      m.client,
    );
    expect(result.lifecycle_status).toBe("live");
    const inserted = m.inserts.directives[0];
    expect(inserted.lifecycle_status).toBe("live");
    expect(inserted.enabled).toBe(true);
    expect(inserted.submitted_by).toBeUndefined();
  });

  it("a manager-authored workflow lands pending_approval + disabled, submitter stamped (AC-1)", async () => {
    const m = makeClient({ org_rows: [], insert_id: "pending-uuid" });
    const result = await createCustomDirective(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "manager",
        input: {
          display_name: "Manager workflow",
          trigger_kind: "lead.created",
          trigger_config: {},
          action_kind: "flag_lead",
          action_config: {},
          enabled: true,
        },
      },
      m.client,
    );
    expect(result.lifecycle_status).toBe("pending_approval");
    const inserted = m.inserts.directives[0];
    expect(inserted.lifecycle_status).toBe("pending_approval");
    // disabled regardless of input.enabled — runtime-inert until approved.
    expect(inserted.enabled).toBe(false);
    expect(inserted.submitted_by).toBe(ACTOR);
    expect(inserted.submitted_at).toBeTruthy();
    // audit row stamps the real role, not a hard-coded "org_admin".
    expect(m.inserts.audit_log[0].actor_role).toBe("manager");
    expect(m.inserts.audit_log[0].diff).toMatchObject({
      lifecycle_status: "pending_approval",
    });
  });

  it("uses default tier when not supplied (send_template_message → T2)", async () => {
    const m = makeClient({ org_rows: [], insert_id: "x" });
    await createCustomDirective(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          display_name: "Welcome template",
          trigger_kind: "lead.created",
          trigger_config: {},
          action_kind: "send_template_message",
          action_config: { template_id: "T-WELCOME" },
          enabled: true,
        },
      },
      m.client,
    );
    expect(m.inserts.directives[0].tier).toBe("T2");
  });

  it("respects tier override when caller picks T3 (queue-bound)", async () => {
    const m = makeClient({ org_rows: [], insert_id: "x" });
    await createCustomDirective(
      {
        caller_org_id: ORG_A,
        actor_id: ACTOR,
        actor_role: "org_admin",
        input: {
          display_name: "Auto-call escalation",
          trigger_kind: "lead.intent_crossed",
          trigger_config: { threshold: 90 },
          action_kind: "enqueue_agent",
          action_config: {},
          tier: "T3",
          enabled: true,
        },
      },
      m.client,
    );
    expect(m.inserts.directives[0].tier).toBe("T3");
  });
});

describe("listEffectiveDirectives", () => {
  it("merges platform defaults + own-org rows, deduped by code with org winning", async () => {
    const m = makeClient({
      platform_rows: [
        platformRow({ id: "p1", code: "D-01" }),
        platformRow({ id: "p2", code: "D-09", enabled: true }),
        platformRow({ id: "p3", code: "D-15" }),
      ],
      org_rows: [
        orgRow({
          id: "o1",
          code: "D-09",
          organization_id: ORG_A,
          enabled: false,
        }),
        orgRow({
          id: "o2",
          code: "C-01",
          organization_id: ORG_A,
          enabled: true,
        }),
      ],
    });

    const list = await listEffectiveDirectives(ORG_A, m.client);
    const byCode = new Map(list.map((r) => [r.code, r]));
    expect(byCode.size).toBe(4);
    expect(byCode.get("D-01")?.origin).toBe("platform_default");
    expect(byCode.get("D-09")?.origin).toBe("override");
    expect(byCode.get("D-09")?.enabled).toBe(false);
    expect(byCode.get("D-15")?.origin).toBe("platform_default");
    expect(byCode.get("C-01")?.origin).toBe("custom");
  });
});

describe("error-path coverage", () => {
  it("nextCustomCode throws DirectiveAuthoringError on DB error", async () => {
    const m = makeClient({ org_rows: [] });
    // Override the inner select chain to return an error.
    (m.client as unknown as { from: (t: string) => unknown }).from = () => ({
      select: () => ({
        eq: () => ({
          like: () =>
            Promise.resolve({ data: null, error: { message: "DB down" } }),
        }),
      }),
    });
    await expect(nextCustomCode(ORG_A, m.client)).rejects.toBeInstanceOf(
      DirectiveAuthoringError,
    );
  });

  it("createCustomDirective throws on insert error", async () => {
    const m = makeClient({
      org_rows: [],
      insert_id: "irrelevant",
      insert_error: "constraint violation",
    });
    await expect(
      createCustomDirective(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          input: {
            display_name: "Bad",
            trigger_kind: "lead.created",
            trigger_config: {},
            action_kind: "flag_lead",
            action_config: {},
            enabled: true,
          },
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(DirectiveAuthoringError);
  });

  it("toggleDirective throws on UPDATE error against existing org row", async () => {
    const m = makeClient({
      org_rows: [orgRow({ code: "D-09", organization_id: ORG_A })],
      update_error: "row locked",
    });
    await expect(
      toggleDirective(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          code: "D-09",
          enabled: false,
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(DirectiveAuthoringError);
  });

  it("toggleDirective throws on INSERT error when overriding platform default", async () => {
    const m = makeClient({
      org_rows: [],
      platform_rows: [platformRow({ code: "D-09" })],
      insert_error: "rls violation",
    });
    await expect(
      toggleDirective(
        {
          caller_org_id: ORG_A,
          actor_id: ACTOR,
          actor_role: "org_admin",
          code: "D-09",
          enabled: false,
        },
        m.client,
      ),
    ).rejects.toBeInstanceOf(DirectiveAuthoringError);
  });
});

describe("listRecentInvocations", () => {
  it("returns rows joined to directives.code", async () => {
    const m = makeClient({
      recent_invocations: [
        {
          id: "i1",
          ts: "2026-05-09T10:00:00Z",
          directive_id: "d1",
          outcome: "dispatched",
          subject_node_id: "n1",
          details: { foo: 1 },
          directives: { code: "D-09", display_name: "Call objection" },
        },
      ],
    });

    const rows = await listRecentInvocations(ORG_A, 50, m.client);
    expect(rows).toEqual([
      {
        id: "i1",
        ts: "2026-05-09T10:00:00Z",
        directive_id: "d1",
        outcome: "dispatched",
        subject_node_id: "n1",
        details: { foo: 1 },
        code: "D-09",
        display_name: "Call objection",
      },
    ]);
  });
});
