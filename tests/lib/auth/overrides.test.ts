import { describe, expect, it, vi } from "vitest";
import {
  listOverrides,
  softDeleteOverride,
  upsertOverride,
} from "@/lib/auth/overrides";

const ORG = "11111111-2222-4333-8444-555555555555";
const ACTOR = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OVERRIDE_ID = "12345678-1234-4567-8910-111213141516";

const makeAuditRecorder = () => {
  const audit: Array<Record<string, unknown>> = [];
  return {
    audit,
    auditFrom: {
      insert: vi.fn((row: Record<string, unknown>) => {
        audit.push(row);
        return Promise.resolve({ error: null });
      }),
    },
  };
};

const makeClient = (handlers: {
  rpo?: () => unknown;
  audit_log?: () => unknown;
}): { client: { from: ReturnType<typeof vi.fn> }; calls: string[] } => {
  const calls: string[] = [];
  return {
    client: {
      from: vi.fn((table: string) => {
        calls.push(table);
        if (table === "role_permission_overrides" && handlers.rpo)
          return handlers.rpo();
        if (table === "audit_log" && handlers.audit_log)
          return handlers.audit_log();
        throw new Error(`Unexpected from('${table}')`);
      }),
    },
    calls,
  };
};

describe("listOverrides", () => {
  it("returns rows for the org, scoped by deleted_at IS NULL", async () => {
    const rows = [
      {
        id: OVERRIDE_ID,
        organization_id: ORG,
        role: "sales_rep",
        permission: "leads:bulk_import",
        mode: "allow",
        reason: "pilot",
      },
    ];
    const { client } = makeClient({
      rpo: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    });
    const result = await listOverrides(ORG, client as unknown as never);
    expect(result).toEqual(rows);
  });
});

describe("upsertOverride", () => {
  it("inserts row + writes audit_log", async () => {
    const { audit, auditFrom } = makeAuditRecorder();
    const { client, calls } = makeClient({
      rpo: () => ({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi
            .fn()
            .mockResolvedValue({ data: { id: OVERRIDE_ID }, error: null }),
        }),
      }),
      audit_log: () => auditFrom,
    });

    const result = await upsertOverride(
      {
        organization_id: ORG,
        role: "sales_rep",
        permission: "leads:bulk_import",
        mode: "allow",
        reason: "pilot org allows bulk import",
        actor: ACTOR,
      },
      client as unknown as never
    );
    expect(result.id).toBe(OVERRIDE_ID);
    expect(calls).toEqual(["role_permission_overrides", "audit_log"]);
    expect(audit.length).toBe(1);
    expect(audit[0].action).toBe("rbac_override_upsert");
    expect(audit[0].record_id).toBe(OVERRIDE_ID);
    const diff = audit[0].diff as { after: { permission: string } };
    expect(diff.after.permission).toBe("leads:bulk_import");
  });

  it("propagates the DB error when the guard rejects PLATFORM_ONLY allow", async () => {
    const { client } = makeClient({
      rpo: () => ({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: "42501", message: "PLATFORM_ONLY ..." },
          }),
        }),
      }),
    });
    await expect(
      upsertOverride(
        {
          organization_id: ORG,
          role: "org_admin",
          permission: "platform:manage",
          mode: "allow",
          reason: "should be rejected",
          actor: ACTOR,
        },
        client as unknown as never
      )
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("softDeleteOverride", () => {
  it("soft-deletes + writes audit row", async () => {
    const { audit, auditFrom } = makeAuditRecorder();
    const updateMock = vi
      .fn()
      .mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const { client } = makeClient({
      rpo: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: OVERRIDE_ID, organization_id: ORG, deleted_at: null },
          error: null,
        }),
        update: updateMock,
      }),
      audit_log: () => auditFrom,
    });
    await softDeleteOverride(
      { id: OVERRIDE_ID, actor: ACTOR, reason: "no longer needed" },
      client as unknown as never
    );
    expect(updateMock).toHaveBeenCalledOnce();
    expect(audit[0].action).toBe("rbac_override_delete");
  });

  it("idempotent on already-deleted rows (no UPDATE, no audit row)", async () => {
    const { audit, auditFrom } = makeAuditRecorder();
    const updateMock = vi.fn();
    const { client } = makeClient({
      rpo: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: OVERRIDE_ID,
            organization_id: ORG,
            deleted_at: "2026-05-07T10:00:00Z",
          },
          error: null,
        }),
        update: updateMock,
      }),
      audit_log: () => auditFrom,
    });
    await softDeleteOverride(
      { id: OVERRIDE_ID, actor: ACTOR, reason: "again" },
      client as unknown as never
    );
    expect(updateMock).not.toHaveBeenCalled();
    expect(audit.length).toBe(0);
  });
});
