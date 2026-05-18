// D-607 (V6 Phase 2) — Brochure Repository data layer.
//
// CRUD over the `brochures` table + the Supabase Storage glue (signed
// upload URLs for writes, 1h signed URLs for reads) + findBrochuresForAgent
// — the ranked-match lookup D-600 (Brochure Agent) calls.
//
// Every query is org-scoped; the service-role client bypasses RLS, so the
// organization_id filter is the load-bearing tenant guard (Constitution
// II). Every function takes an optional injectable client (default
// getSupabaseAdmin()) so unit tests inject a chainable mock.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  ALLOWED_MIME_TYPES,
  BROCHURES_BUCKET,
  MAX_FILE_BYTES,
  brochureMetadataSchema,
  documentTypeSchema,
  isAllowedMimeType,
  parseMetadataLenient,
  type BrochureMetadata,
  type DocumentType,
} from "./schemas";

export { BROCHURES_BUCKET } from "./schemas";
const SIGNED_URL_TTL_SECONDS = 3600; // 1h — PRD §D-607.

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type BrochureSummary = {
  id: string;
  project_id: string | null;
  document_type: DocumentType;
  title: string;
  file_size_bytes: number;
  mime_type: string;
  metadata: BrochureMetadata;
  uploaded_at: string;
  uploaded_by: string;
};

export type Brochure = BrochureSummary & { file_path: string };

export type BrochureMatch = BrochureSummary & { match_score: number };

export type BrochureResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "validation" | "error";
      message?: string;
    };

type BrochureRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  document_type: string;
  title: string;
  file_path: string;
  file_size_bytes: number | string;
  mime_type: string;
  metadata: unknown;
  uploaded_at: string;
  uploaded_by: string;
  deleted_at: string | null;
};

const ROW_COLUMNS =
  "id, organization_id, project_id, document_type, title, file_path, file_size_bytes, mime_type, metadata, uploaded_at, uploaded_by, deleted_at";

function mapRow(row: BrochureRow): Brochure {
  const dt = documentTypeSchema.safeParse(row.document_type);
  return {
    id: row.id,
    project_id: row.project_id,
    document_type: dt.success ? dt.data : "brochure",
    title: row.title,
    file_path: row.file_path,
    file_size_bytes: Number(row.file_size_bytes),
    mime_type: row.mime_type,
    metadata: parseMetadataLenient(row.metadata),
    uploaded_at: row.uploaded_at,
    uploaded_by: row.uploaded_by,
  };
}

function toSummary(b: Brochure): BrochureSummary {
  const { file_path: _file_path, ...summary } = b;
  void _file_path;
  return summary;
}

/**
 * Strip directory components and anything that isn't a safe filename
 * character. The result is only ever a leaf segment of a Storage path
 * that the server builds from the *caller's* org id — never trusted as a
 * path itself.
 */
export function sanitizeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "file").trim();
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "file";
}

/** Build the org-namespaced Storage object key for a new upload. */
export function buildObjectPath(
  organization_id: string,
  file_name: string,
): string {
  return `${organization_id}/${randomUUID()}/${sanitizeFileName(file_name)}`;
}

/** A Storage path is in-org iff its first segment is the caller's org id. */
export function isPathInOrg(organization_id: string, path: string): boolean {
  return path.startsWith(`${organization_id}/`);
}

async function writeBrochureAudit(
  client: SupabaseClient,
  args: {
    actor: string;
    organization_id: string;
    record_id: string;
    action: string;
    diff: Record<string, unknown>;
  },
): Promise<void> {
  await client.from("audit_log").insert({
    actor_id: args.actor,
    actor_type: "user",
    actor_role: "brochure_writer",
    organization_id: args.organization_id,
    workspace_id: null,
    table_name: "brochures",
    record_id: args.record_id,
    action: args.action,
    diff: args.diff,
  });
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function listBrochures(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<BrochureSummary[]> {
  const { data } = await client
    .from("brochures")
    .select(ROW_COLUMNS)
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });
  return ((data as BrochureRow[] | null) ?? []).map((r) =>
    toSummary(mapRow(r)),
  );
}

export async function getBrochure(
  organization_id: string,
  id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<Brochure | null> {
  if (!UUID_RE.test(id)) return null;
  const { data } = await client
    .from("brochures")
    .select(ROW_COLUMNS)
    .eq("organization_id", organization_id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return data ? mapRow(data as BrochureRow) : null;
}

export type BrochureMatchCriteria = {
  organization_id: string;
  project_id?: string;
  document_type?: DocumentType;
  bhk?: number;
  budget_band?: string;
  area_sqft?: number;
};

function normalizeBand(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

function scoreBrochure(
  b: BrochureSummary,
  c: BrochureMatchCriteria,
): number {
  let score = 0;
  if (c.bhk !== undefined && b.metadata.bhk === c.bhk) score += 3;
  if (
    c.budget_band !== undefined &&
    b.metadata.budget_band !== undefined &&
    normalizeBand(b.metadata.budget_band) === normalizeBand(c.budget_band)
  ) {
    score += 2;
  }
  if (
    c.area_sqft !== undefined &&
    b.metadata.area_sqft_min !== undefined &&
    b.metadata.area_sqft_max !== undefined &&
    c.area_sqft >= b.metadata.area_sqft_min &&
    c.area_sqft <= b.metadata.area_sqft_max
  ) {
    score += 1;
  }
  return score;
}

/**
 * D-600 entry point — find the org's brochures matching a Voice IQ
 * next-best-action's criteria, ranked best-first.
 *
 * `project_id` and `document_type`, when supplied, are HARD filters
 * (the agent never sends another project's collateral). `bhk` /
 * `budget_band` / `area_sqft` are SOFT — they rank, they don't exclude:
 * exact bhk +3, budget_band match +2, area within [min,max] +1. Ties
 * break to the most recently uploaded. The org filter is load-bearing
 * tenant isolation on the service-role read.
 */
export async function findBrochuresForAgent(
  criteria: BrochureMatchCriteria,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<BrochureMatch[]> {
  let q = client
    .from("brochures")
    .select(ROW_COLUMNS)
    .eq("organization_id", criteria.organization_id)
    .is("deleted_at", null);
  if (criteria.project_id) q = q.eq("project_id", criteria.project_id);
  if (criteria.document_type) {
    q = q.eq("document_type", criteria.document_type);
  }
  const { data } = await q;
  const rows = ((data as BrochureRow[] | null) ?? []).map((r) =>
    toSummary(mapRow(r)),
  );
  return rows
    .map((b) => ({ ...b, match_score: scoreBrochure(b, criteria) }))
    .sort((a, b) => {
      if (a.match_score !== b.match_score) return b.match_score - a.match_score;
      return a.uploaded_at < b.uploaded_at ? 1 : -1;
    });
}

// ── Storage glue ───────────────────────────────────────────────────────────

export type UploadUrlResult =
  | { ok: true; path: string; token: string; signed_url: string }
  | { ok: false; reason: "validation" | "error"; message?: string };

/**
 * Issue a scoped, single-use signed upload URL. The Storage path is built
 * from the CALLER's org id — never client input — so a finalize step can
 * later assert the returned path is in-org. mime + size are validated
 * here so a rejected file never reaches Storage.
 */
export async function requestUploadUrl(
  args: {
    organization_id: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<UploadUrlResult> {
  if (!isAllowedMimeType(args.mime_type)) {
    return {
      ok: false,
      reason: "validation",
      message: `Unsupported file type — allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }
  if (
    !Number.isFinite(args.size_bytes) ||
    args.size_bytes <= 0 ||
    args.size_bytes > MAX_FILE_BYTES
  ) {
    return {
      ok: false,
      reason: "validation",
      message: `File too large — max ${MAX_FILE_BYTES} bytes`,
    };
  }
  const path = buildObjectPath(args.organization_id, args.file_name);
  const { data, error } = await client.storage
    .from(BROCHURES_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, reason: "error", message: error?.message };
  }
  return {
    ok: true,
    path: data.path ?? path,
    token: data.token,
    signed_url: data.signedUrl,
  };
}

export type SignedUrlResult =
  | { ok: true; url: string; title: string }
  | { ok: false; reason: "not_found" | "error"; message?: string };

/** Resolve an org-scoped row → a 1h signed read URL. Cross-org id → not_found. */
export async function getBrochureSignedUrl(
  organization_id: string,
  id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<SignedUrlResult> {
  const brochure = await getBrochure(organization_id, id, client);
  if (!brochure) return { ok: false, reason: "not_found" };
  const { data, error } = await client.storage
    .from(BROCHURES_BUCKET)
    .createSignedUrl(brochure.file_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    return { ok: false, reason: "error", message: error?.message };
  }
  return { ok: true, url: data.signedUrl, title: brochure.title };
}

// ── Writes ─────────────────────────────────────────────────────────────────

export type CreateBrochureArgs = {
  organization_id: string;
  uploaded_by: string;
  document_type: string;
  title: string;
  file_path: string;
  file_size_bytes: number;
  mime_type: string;
  project_id?: string | null;
  metadata?: unknown;
};

export type CreateBrochureResult =
  | { ok: true; id: string }
  | { ok: false; reason: "validation" | "error"; message?: string };

/**
 * Insert a brochures row for an already-uploaded Storage object. Validates
 * document_type, mime, size, the metadata jsonb, and that the file_path is
 * in the caller's org before the write. Writes an audit_log row.
 */
export async function createBrochure(
  args: CreateBrochureArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<CreateBrochureResult> {
  const dt = documentTypeSchema.safeParse(args.document_type);
  if (!dt.success) {
    return { ok: false, reason: "validation", message: "Invalid document_type" };
  }
  if (!args.title.trim()) {
    return { ok: false, reason: "validation", message: "Title is required" };
  }
  if (!isAllowedMimeType(args.mime_type)) {
    return { ok: false, reason: "validation", message: "Unsupported file type" };
  }
  if (
    !Number.isFinite(args.file_size_bytes) ||
    args.file_size_bytes <= 0 ||
    args.file_size_bytes > MAX_FILE_BYTES
  ) {
    return { ok: false, reason: "validation", message: "File too large" };
  }
  if (!isPathInOrg(args.organization_id, args.file_path)) {
    return {
      ok: false,
      reason: "validation",
      message: "file_path is not in the caller's org namespace",
    };
  }
  const meta = brochureMetadataSchema.safeParse(args.metadata ?? {});
  if (!meta.success) {
    return {
      ok: false,
      reason: "validation",
      message: meta.error.issues[0]?.message ?? "Invalid metadata",
    };
  }
  if (args.project_id && !UUID_RE.test(args.project_id)) {
    return { ok: false, reason: "validation", message: "Invalid project_id" };
  }

  const { data, error } = await client
    .from("brochures")
    .insert({
      organization_id: args.organization_id,
      project_id: args.project_id ?? null,
      document_type: dt.data,
      title: args.title.trim(),
      file_path: args.file_path,
      file_size_bytes: args.file_size_bytes,
      mime_type: args.mime_type,
      metadata: meta.data,
      uploaded_by: args.uploaded_by,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, reason: "error", message: error?.message };
  }
  const id = (data as { id: string }).id;
  await writeBrochureAudit(client, {
    actor: args.uploaded_by,
    organization_id: args.organization_id,
    record_id: id,
    action: "create",
    diff: {
      title: args.title.trim(),
      document_type: dt.data,
      project_id: args.project_id ?? null,
    },
  });
  return { ok: true, id };
}

export type UpdateBrochureArgs = {
  organization_id: string;
  id: string;
  actor: string;
  title?: string;
  project_id?: string | null;
  document_type?: string;
  metadata?: unknown;
};

/**
 * Update a brochure's metadata / title / type / project. Never touches
 * file_path — re-uploading a file is delete + create (PRD §D-607: no
 * versioning). Org-scoped; writes an audit_log row.
 */
export async function updateBrochureMetadata(
  args: UpdateBrochureArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<BrochureResult> {
  if (!UUID_RE.test(args.id)) {
    return { ok: false, reason: "validation", message: "Invalid id" };
  }
  const patch: Record<string, unknown> = {};
  if (args.title !== undefined) {
    if (!args.title.trim()) {
      return { ok: false, reason: "validation", message: "Title is required" };
    }
    patch.title = args.title.trim();
  }
  if (args.document_type !== undefined) {
    const dt = documentTypeSchema.safeParse(args.document_type);
    if (!dt.success) {
      return {
        ok: false,
        reason: "validation",
        message: "Invalid document_type",
      };
    }
    patch.document_type = dt.data;
  }
  if (args.project_id !== undefined) {
    if (args.project_id !== null && !UUID_RE.test(args.project_id)) {
      return { ok: false, reason: "validation", message: "Invalid project_id" };
    }
    patch.project_id = args.project_id;
  }
  if (args.metadata !== undefined) {
    const meta = brochureMetadataSchema.safeParse(args.metadata ?? {});
    if (!meta.success) {
      return {
        ok: false,
        reason: "validation",
        message: meta.error.issues[0]?.message ?? "Invalid metadata",
      };
    }
    patch.metadata = meta.data;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, reason: "validation", message: "Nothing to update" };
  }

  const { data, error } = await client
    .from("brochures")
    .update(patch)
    .eq("organization_id", args.organization_id)
    .eq("id", args.id)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false, reason: "error", message: error.message };
  const rows = (data as unknown[] | null) ?? [];
  if (rows.length === 0) return { ok: false, reason: "not_found" };

  await writeBrochureAudit(client, {
    actor: args.actor,
    organization_id: args.organization_id,
    record_id: args.id,
    action: "update",
    diff: patch,
  });
  return { ok: true };
}

/**
 * Soft-delete a brochure (deleted_at = now()) and best-effort remove the
 * Storage object so its signed URLs 404. Org-scoped. Writes an audit_log
 * row. A failed Storage remove does not fail the operation — the row is
 * already soft-deleted and invisible to every read path.
 */
export async function softDeleteBrochure(
  args: { organization_id: string; id: string; actor: string },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<BrochureResult> {
  if (!UUID_RE.test(args.id)) {
    return { ok: false, reason: "validation", message: "Invalid id" };
  }
  const brochure = await getBrochure(args.organization_id, args.id, client);
  if (!brochure) return { ok: false, reason: "not_found" };

  const { error } = await client
    .from("brochures")
    .update({ deleted_at: new Date().toISOString() })
    .eq("organization_id", args.organization_id)
    .eq("id", args.id)
    .is("deleted_at", null);
  if (error) return { ok: false, reason: "error", message: error.message };

  // Best-effort — the row is already invisible; an orphaned object is
  // harmless and a Storage hiccup must not fail the delete.
  try {
    await client.storage.from(BROCHURES_BUCKET).remove([brochure.file_path]);
  } catch {
    // swallow — see above
  }

  await writeBrochureAudit(client, {
    actor: args.actor,
    organization_id: args.organization_id,
    record_id: args.id,
    action: "delete",
    diff: { title: brochure.title, file_path: brochure.file_path },
  });
  return { ok: true };
}
