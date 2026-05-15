import { describe, expect, it } from "vitest";
import {
  buildObjectPath,
  createBrochure,
  findBrochuresForAgent,
  getBrochure,
  getBrochureSignedUrl,
  isPathInOrg,
  listBrochures,
  requestUploadUrl,
  sanitizeFileName,
  softDeleteBrochure,
  updateBrochureMetadata,
} from "@/lib/brochures/repository";

const ORG = "11111111-2222-4333-8444-555555555555";
const OTHER_ORG = "99999999-2222-4333-8444-555555555555";
const USER = "aaaaaaaa-2222-4333-8444-555555555555";
const ID = "22222222-3333-4444-8555-666666666666";
const PROJECT = "33333333-3333-4444-8555-666666666666";

type Row = {
  id: string;
  organization_id: string;
  project_id: string | null;
  document_type: string;
  title: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  metadata: unknown;
  uploaded_at: string;
  uploaded_by: string;
  deleted_at: string | null;
};

function makeRow(over: Partial<Row> = {}): Row {
  return {
    id: ID,
    organization_id: ORG,
    project_id: PROJECT,
    document_type: "floor_plan",
    title: "3BHK floor plan",
    file_path: `${ORG}/abcd/floor.pdf`,
    file_size_bytes: 2048,
    mime_type: "application/pdf",
    metadata: { tags: [] },
    uploaded_at: "2026-05-14T10:00:00.000Z",
    uploaded_by: USER,
    deleted_at: null,
    ...over,
  };
}

function makeClient(
  opts: {
    selectMany?: Row[];
    single?: Row | null;
    insertResult?: {
      data: { id: string } | null;
      error: { message: string } | null;
    };
    updateRows?: unknown[] | null;
    updateError?: { message: string } | null;
    uploadUrlResult?: {
      data: { path?: string; token: string; signedUrl: string } | null;
      error: { message: string } | null;
    };
    signedUrlResult?: {
      data: { signedUrl: string } | null;
      error: { message: string } | null;
    };
  } = {},
) {
  const auditInserts: Array<Record<string, unknown>> = [];
  const brochureInserts: Array<Record<string, unknown>> = [];
  const brochureUpdates: Array<Record<string, unknown>> = [];
  const storageRemovals: string[][] = [];

  function brochuresBuilder() {
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      is: () => b,
      order: () =>
        Promise.resolve({ data: opts.selectMany ?? [], error: null }),
      maybeSingle: () =>
        Promise.resolve({ data: opts.single ?? null, error: null }),
      then: (onF: (v: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: opts.selectMany ?? [], error: null }).then(onF),
      insert: (rowArg: Record<string, unknown>) => {
        brochureInserts.push(rowArg);
        const ib: Record<string, unknown> = {};
        Object.assign(ib, {
          select: () => ib,
          single: () =>
            Promise.resolve(
              opts.insertResult ?? {
                data: { id: "brochure-new" },
                error: null,
              },
            ),
        });
        return ib;
      },
      update: (patch: Record<string, unknown>) => {
        brochureUpdates.push(patch);
        const ub: Record<string, unknown> = {};
        Object.assign(ub, {
          eq: () => ub,
          is: () => ub,
          select: () =>
            Promise.resolve({
              data: opts.updateRows ?? [{ id: "brochure-x" }],
              error: null,
            }),
          then: (onF: (v: { error: unknown }) => unknown) =>
            Promise.resolve({ error: opts.updateError ?? null }).then(onF),
        });
        return ub;
      },
    });
    return b;
  }

  const client = {
    from: (table: string) => {
      if (table === "brochures") return brochuresBuilder();
      if (table === "audit_log") {
        return {
          insert: (rowArg: Record<string, unknown>) => {
            auditInserts.push(rowArg);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: (bucket: string) => {
        if (bucket !== "brochures") {
          throw new Error(`unexpected bucket ${bucket}`);
        }
        return {
          createSignedUploadUrl: (path: string) =>
            Promise.resolve(
              opts.uploadUrlResult ?? {
                data: {
                  path,
                  token: "tok-123",
                  signedUrl: "https://signed/upload",
                },
                error: null,
              },
            ),
          createSignedUrl: (_path: string, _ttl: number) =>
            Promise.resolve(
              opts.signedUrlResult ?? {
                data: { signedUrl: "https://signed/read" },
                error: null,
              },
            ),
          remove: (paths: string[]) => {
            storageRemovals.push(paths);
            return Promise.resolve({ data: {}, error: null });
          },
        };
      },
    },
  };

  return { client, auditInserts, brochureInserts, brochureUpdates, storageRemovals };
}

describe("path helpers", () => {
  it("sanitizeFileName strips directory components + unsafe chars", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("My Floor Plan (final).pdf")).toBe(
      "My_Floor_Plan_final_.pdf",
    );
    expect(sanitizeFileName("C:\\Users\\x\\a.png")).toBe("a.png");
    expect(sanitizeFileName("")).toBe("file");
  });

  it("buildObjectPath namespaces under the org id", () => {
    const p = buildObjectPath(ORG, "deck.pdf");
    expect(p.startsWith(`${ORG}/`)).toBe(true);
    expect(p.endsWith("/deck.pdf")).toBe(true);
  });

  it("isPathInOrg only accepts the caller's org prefix", () => {
    expect(isPathInOrg(ORG, `${ORG}/abc/x.pdf`)).toBe(true);
    expect(isPathInOrg(ORG, `${OTHER_ORG}/abc/x.pdf`)).toBe(false);
  });
});

describe("listBrochures", () => {
  it("maps rows to summaries (no file_path leaked)", async () => {
    const { client } = makeClient({
      selectMany: [makeRow({ metadata: { bhk: 3, tags: ["x"] } })],
    });
    const rows = await listBrochures(ORG, client as never);
    expect(rows).toHaveLength(1);
    expect(rows[0].document_type).toBe("floor_plan");
    expect(rows[0].metadata.bhk).toBe(3);
    expect("file_path" in rows[0]).toBe(false);
  });

  it("returns [] when the org has no brochures", async () => {
    const { client } = makeClient({ selectMany: [] });
    expect(await listBrochures(ORG, client as never)).toEqual([]);
  });
});

describe("getBrochure", () => {
  it("returns a mapped brochure incl. file_path", async () => {
    const { client } = makeClient({ single: makeRow() });
    const b = await getBrochure(ORG, ID, client as never);
    expect(b?.file_path).toBe(`${ORG}/abcd/floor.pdf`);
  });

  it("returns null for a malformed id without touching the client", async () => {
    const { client } = makeClient({ single: makeRow() });
    expect(await getBrochure(ORG, "not-a-uuid", client as never)).toBeNull();
  });

  it("returns null when the row is not visible (cross-org / deleted)", async () => {
    const { client } = makeClient({ single: null });
    expect(await getBrochure(ORG, ID, client as never)).toBeNull();
  });
});

describe("findBrochuresForAgent — ranked match (AC-2)", () => {
  it("ranks exact bhk (+3) above budget_band (+2) above area (+1)", async () => {
    const { client } = makeClient({
      selectMany: [
        makeRow({
          id: "area-only",
          metadata: { area_sqft_min: 1000, area_sqft_max: 1500, tags: [] },
        }),
        makeRow({
          id: "bhk-match",
          metadata: { bhk: 3, tags: [] },
        }),
        makeRow({
          id: "band-match",
          metadata: { budget_band: "1.5-2Cr", tags: [] },
        }),
      ],
    });
    const matches = await findBrochuresForAgent(
      {
        organization_id: ORG,
        bhk: 3,
        budget_band: "1.5-2Cr",
        area_sqft: 1200,
      },
      client as never,
    );
    expect(matches.map((m) => m.id)).toEqual([
      "bhk-match",
      "band-match",
      "area-only",
    ]);
    expect(matches[0].match_score).toBe(3);
    expect(matches[1].match_score).toBe(2);
    expect(matches[2].match_score).toBe(1);
  });

  it("normalizes budget_band casing/whitespace before comparing", async () => {
    const { client } = makeClient({
      selectMany: [
        makeRow({ id: "band", metadata: { budget_band: "1.5-2 Cr", tags: [] } }),
      ],
    });
    const matches = await findBrochuresForAgent(
      { organization_id: ORG, budget_band: "1.5-2cr" },
      client as never,
    );
    expect(matches[0].match_score).toBe(2);
  });

  it("returns all hard-filter matches even at score 0, newest first", async () => {
    const { client } = makeClient({
      selectMany: [
        makeRow({ id: "older", uploaded_at: "2026-05-10T00:00:00.000Z" }),
        makeRow({ id: "newer", uploaded_at: "2026-05-13T00:00:00.000Z" }),
      ],
    });
    const matches = await findBrochuresForAgent(
      { organization_id: ORG },
      client as never,
    );
    expect(matches.map((m) => m.id)).toEqual(["newer", "older"]);
    expect(matches.every((m) => m.match_score === 0)).toBe(true);
  });
});

describe("createBrochure", () => {
  const base = {
    organization_id: ORG,
    uploaded_by: USER,
    document_type: "floor_plan",
    title: "3BHK floor plan",
    file_path: `${ORG}/abcd/floor.pdf`,
    file_size_bytes: 2048,
    mime_type: "application/pdf",
    project_id: PROJECT,
    metadata: { bhk: 3, tags: [] },
  };

  it("inserts the row + writes a create audit row on the happy path", async () => {
    const { client, auditInserts, brochureInserts } = makeClient({
      insertResult: { data: { id: "brochure-1" }, error: null },
    });
    const r = await createBrochure(base, client as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.id).toBe("brochure-1");
    expect(brochureInserts).toHaveLength(1);
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0].action).toBe("create");
    expect(auditInserts[0].table_name).toBe("brochures");
    expect(auditInserts[0].workspace_id).toBeNull();
  });

  it("rejects an unknown document_type", async () => {
    const { client } = makeClient();
    const r = await createBrochure(
      { ...base, document_type: "contract" },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("validation");
  });

  it("rejects a disallowed mime type", async () => {
    const { client } = makeClient();
    const r = await createBrochure(
      { ...base, mime_type: "image/gif" },
      client as never,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a file over the 25 MB cap", async () => {
    const { client } = makeClient();
    const r = await createBrochure(
      { ...base, file_size_bytes: 30_000_000 },
      client as never,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a file_path outside the caller's org namespace", async () => {
    const { client } = makeClient();
    const r = await createBrochure(
      { ...base, file_path: `${OTHER_ORG}/abcd/floor.pdf` },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("validation");
  });

  it("rejects invalid metadata (bhk out of range)", async () => {
    const { client } = makeClient();
    const r = await createBrochure(
      { ...base, metadata: { bhk: 9 } },
      client as never,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a blank title", async () => {
    const { client } = makeClient();
    const r = await createBrochure({ ...base, title: "  " }, client as never);
    expect(r.ok).toBe(false);
  });
});

describe("updateBrochureMetadata", () => {
  it("updates + writes an update audit row", async () => {
    const { client, auditInserts, brochureUpdates } = makeClient({
      updateRows: [{ id: ID }],
    });
    const r = await updateBrochureMetadata(
      { organization_id: ORG, id: ID, actor: USER, title: "Renamed" },
      client as never,
    );
    expect(r.ok).toBe(true);
    expect(brochureUpdates[0]).toEqual({ title: "Renamed" });
    expect(auditInserts[0].action).toBe("update");
  });

  it("returns not_found when no row matched (cross-org / deleted)", async () => {
    const { client } = makeClient({ updateRows: [] });
    const r = await updateBrochureMetadata(
      { organization_id: ORG, id: ID, actor: USER, title: "Renamed" },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });

  it("rejects an empty patch", async () => {
    const { client } = makeClient();
    const r = await updateBrochureMetadata(
      { organization_id: ORG, id: ID, actor: USER },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("validation");
  });

  it("rejects invalid metadata", async () => {
    const { client } = makeClient();
    const r = await updateBrochureMetadata(
      { organization_id: ORG, id: ID, actor: USER, metadata: { bhk: 0 } },
      client as never,
    );
    expect(r.ok).toBe(false);
  });
});

describe("softDeleteBrochure (AC-4)", () => {
  it("soft-deletes, removes the storage object, and writes a delete audit row", async () => {
    const { client, auditInserts, brochureUpdates, storageRemovals } =
      makeClient({ single: makeRow() });
    const r = await softDeleteBrochure(
      { organization_id: ORG, id: ID, actor: USER },
      client as never,
    );
    expect(r.ok).toBe(true);
    expect(brochureUpdates[0]).toHaveProperty("deleted_at");
    expect(storageRemovals[0]).toEqual([`${ORG}/abcd/floor.pdf`]);
    expect(auditInserts[0].action).toBe("delete");
  });

  it("returns not_found for a cross-org / missing id", async () => {
    const { client, storageRemovals } = makeClient({ single: null });
    const r = await softDeleteBrochure(
      { organization_id: ORG, id: ID, actor: USER },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
    expect(storageRemovals).toHaveLength(0);
  });
});

describe("requestUploadUrl (AC-3)", () => {
  it("issues a signed upload URL with an org-namespaced path", async () => {
    const { client } = makeClient();
    const r = await requestUploadUrl(
      {
        organization_id: ORG,
        file_name: "deck.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
      },
      client as never,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.path.startsWith(`${ORG}/`)).toBe(true);
      expect(r.token).toBe("tok-123");
      expect(r.signed_url).toBe("https://signed/upload");
    }
  });

  it("rejects a disallowed mime type before touching storage", async () => {
    const { client } = makeClient();
    const r = await requestUploadUrl(
      {
        organization_id: ORG,
        file_name: "x.gif",
        mime_type: "image/gif",
        size_bytes: 1024,
      },
      client as never,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("validation");
  });

  it("rejects an oversized file", async () => {
    const { client } = makeClient();
    const r = await requestUploadUrl(
      {
        organization_id: ORG,
        file_name: "big.pdf",
        mime_type: "application/pdf",
        size_bytes: 30_000_000,
      },
      client as never,
    );
    expect(r.ok).toBe(false);
  });
});

describe("getBrochureSignedUrl (AC-3)", () => {
  it("returns a 1h signed URL for an in-org brochure", async () => {
    const { client } = makeClient({ single: makeRow() });
    const r = await getBrochureSignedUrl(ORG, ID, client as never);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toBe("https://signed/read");
      expect(r.title).toBe("3BHK floor plan");
    }
  });

  it("returns not_found for a cross-org id (never a URL)", async () => {
    const { client } = makeClient({ single: null });
    const r = await getBrochureSignedUrl(OTHER_ORG, ID, client as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });
});
