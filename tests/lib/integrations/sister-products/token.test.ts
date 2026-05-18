import { describe, expect, it, beforeEach } from "vitest";
import {
  hashToken,
  generateTokenPlaintext,
  issueToken,
  verifyToken,
  revokeToken,
  listTokens,
  SISTER_PRODUCT_KINDS,
} from "@/lib/integrations/sister-products/token";

/* ─────────────────────────────────────────────────────────────────────────
   Hand-rolled in-memory fake for the SupabaseClient chains token.ts uses:
     issueToken:   .from(t).insert(payload).select("id").single()
     verifyToken:  .from(t).select(...).eq(col, v).maybeSingle()
                   + fire-and-forget .from(t).update({...}).eq(col, v)
     revokeToken:  .from(t).update({...}).eq("id", id)         (awaited)
     listTokens:   .from(t).select(...).order("created_at", {…})
                   optionally with .eq("organization_id", v) in the chain.
   Terminal methods (.single, .maybeSingle, .then) execute the buffered
   action — there is no replay between awaits because each `.from(t)` call
   returns a fresh builder.
   ──────────────────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

function makeFakeAdmin() {
  const rows: Row[] = [];
  let idCounter = 0;

  function builderFor(table: string) {
    if (table !== "org_sister_product_tokens") {
      throw new Error(`unexpected table ${table}`);
    }
    let insertPayload: Row | null = null;
    let updatePayload: Row | null = null;
    const eqs: Array<{ col: string; val: unknown }> = [];
    let orderCol: string | null = null;

    function executeInsert(): { data: Row | null; error: null } {
      const row: Row = {
        id: `id-${++idCounter}`,
        ...insertPayload,
        created_at: new Date(2026, 4, 13, 12, idCounter).toISOString(),
        last_used_at: null,
        revoked_at: null,
        revoked_by: null,
      };
      rows.push(row);
      return { data: row, error: null };
    }
    function executeSelectMaybeSingle(): { data: Row | null; error: null } {
      const m = rows.find((r) =>
        eqs.every(({ col, val }) => r[col] === val),
      );
      return { data: m ?? null, error: null };
    }
    function executeUpdate(): { data: Row | null; error: null } {
      let touched: Row | null = null;
      for (const r of rows) {
        if (eqs.every(({ col, val }) => r[col] === val)) {
          Object.assign(r, updatePayload);
          touched = r;
        }
      }
      return { data: touched, error: null };
    }
    function executeSelectList(): { data: Row[]; error: null } {
      let filtered = rows.filter((r) =>
        eqs.every(({ col, val }) => r[col] === val),
      );
      if (orderCol) {
        const col = orderCol;
        filtered = filtered
          .slice()
          .sort((a, b) =>
            String(b[col] ?? "").localeCompare(String(a[col] ?? "")),
          );
      }
      return { data: filtered, error: null };
    }

    const builder = {
      insert(p: Row) {
        insertPayload = p;
        return builder;
      },
      update(p: Row) {
        updatePayload = p;
        return builder;
      },
      select(_cols?: string) {
        return builder;
      },
      eq(col: string, val: unknown) {
        eqs.push({ col, val });
        return builder;
      },
      order(col: string, _opts?: unknown) {
        orderCol = col;
        return builder;
      },
      async single() {
        if (insertPayload) return executeInsert();
        const r = executeSelectMaybeSingle();
        if (!r.data) {
          return { data: null, error: { message: "not found" } };
        }
        return r;
      },
      async maybeSingle() {
        return executeSelectMaybeSingle();
      },
      then(
        onF: (v: { data: Row[] | Row | null; error: null }) => unknown,
        onR?: (e: unknown) => unknown,
      ) {
        // Terminal-less chain (e.g. `.update().eq().then(...)` or
        // `.select().eq().order().then(...)`) — pick by which mutator was set.
        const result = updatePayload
          ? executeUpdate()
          : executeSelectList();
        return Promise.resolve(result).then(onF, onR);
      },
    };
    return builder;
  }

  return {
    from(table: string) {
      return builderFor(table);
    },
    _rows: () => rows.slice(),
    _reset: () => {
      rows.length = 0;
      idCounter = 0;
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────── */

const ORG = "00000000-0000-4000-8000-000000000001";
const ADMIN_USER = "00000000-0000-4000-8000-000000000099";

describe("sister-product token primitives", () => {
  it("hashToken is deterministic and 64 hex chars", () => {
    const h = hashToken("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("hello")).toBe(h);
    expect(hashToken("world")).not.toBe(h);
  });

  it("generateTokenPlaintext returns base64url with no padding", () => {
    const t = generateTokenPlaintext();
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateTokenPlaintext()).not.toBe(t);
  });

  it("SISTER_PRODUCT_KINDS is marketing_intelligence_hub only (V6)", () => {
    expect(SISTER_PRODUCT_KINDS).toEqual(["marketing_intelligence_hub"]);
  });
});

describe("issueToken + verifyToken roundtrip", () => {
  let admin: ReturnType<typeof makeFakeAdmin>;
  beforeEach(() => {
    admin = makeFakeAdmin();
  });

  it("issueToken returns plaintext + last4 matching the saved hash", async () => {
    // @ts-expect-error — fake doesn't fully match SupabaseClient shape
    const out = await issueToken(admin, {
      organization_id: ORG,
      product_kind: "marketing_intelligence_hub",
      created_by: ADMIN_USER,
    });
    expect(out.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(out.last4).toBe(out.token.slice(-4));
    const stored = admin._rows()[0];
    expect(stored.token_hash).toBe(hashToken(out.token));
    expect(stored.organization_id).toBe(ORG);
    expect(stored.product_kind).toBe("marketing_intelligence_hub");
    expect(stored.last4).toBe(out.last4);
    expect(stored.revoked_at).toBeNull();
  });

  it("verifyToken resolves to the right org + product on a fresh token", async () => {
    // @ts-expect-error fake
    const issued = await issueToken(admin, {
      organization_id: ORG,
      product_kind: "marketing_intelligence_hub",
      created_by: ADMIN_USER,
    });
    // @ts-expect-error fake
    const v = await verifyToken(admin, issued.token);
    expect(v).toEqual({ org_id: ORG, product_kind: "marketing_intelligence_hub" });
  });

  it("verifyToken returns null for an unknown token", async () => {
    // @ts-expect-error fake
    const v = await verifyToken(admin, "definitely-not-a-real-token");
    expect(v).toBeNull();
  });

  it("verifyToken returns null after revokeToken (soft revoke)", async () => {
    // @ts-expect-error fake
    const issued = await issueToken(admin, {
      organization_id: ORG,
      product_kind: "marketing_intelligence_hub",
      created_by: ADMIN_USER,
    });
    // @ts-expect-error fake
    await revokeToken(admin, { id: issued.id, revoked_by: ADMIN_USER });
    // @ts-expect-error fake
    expect(await verifyToken(admin, issued.token)).toBeNull();
    const stored = admin._rows()[0];
    expect(stored.revoked_at).not.toBeNull();
    expect(stored.revoked_by).toBe(ADMIN_USER);
  });

  it("verifyToken returns null for empty input without hashing", async () => {
    // @ts-expect-error fake
    expect(await verifyToken(admin, "")).toBeNull();
  });
});

describe("listTokens", () => {
  it("returns all tokens (descending by created_at)", async () => {
    const admin = makeFakeAdmin();
    // @ts-expect-error fake
    await issueToken(admin, {
      organization_id: ORG,
      product_kind: "marketing_intelligence_hub",
      created_by: ADMIN_USER,
    });
    // @ts-expect-error fake
    await issueToken(admin, {
      organization_id: ORG,
      product_kind: "marketing_intelligence_hub",
      created_by: ADMIN_USER,
    });
    // @ts-expect-error fake
    const list = await listTokens(admin);
    expect(list).toHaveLength(2);
    expect(list[0].last4.length).toBe(4);
  });

  it("filters by organization_id when supplied", async () => {
    const admin = makeFakeAdmin();
    const otherOrg = "00000000-0000-4000-8000-000000000002";
    // @ts-expect-error fake
    await issueToken(admin, {
      organization_id: ORG,
      product_kind: "marketing_intelligence_hub",
      created_by: ADMIN_USER,
    });
    // @ts-expect-error fake
    await issueToken(admin, {
      organization_id: otherOrg,
      product_kind: "marketing_intelligence_hub",
      created_by: ADMIN_USER,
    });
    // @ts-expect-error fake
    const list = await listTokens(admin, ORG);
    expect(list).toHaveLength(1);
    expect(list[0].organization_id).toBe(ORG);
  });
});
