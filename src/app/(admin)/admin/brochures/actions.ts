"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import type { Permission } from "@/lib/auth/rbac";
import {
  createBrochure,
  getBrochureSignedUrl,
  isPathInOrg,
  requestUploadUrl,
  softDeleteBrochure,
  updateBrochureMetadata,
} from "@/lib/brochures/repository";
import type { BrochureMetadataInput } from "@/lib/brochures/schemas";

// ── Result types — discriminated unions, never throw across the boundary ──

export type RequestUploadResult =
  | { ok: true; path: string; token: string; signed_url: string }
  | { ok: false; reason: "permission" | "validation" | "error"; message?: string };

export type CreateBrochureActionResult =
  | { ok: true; id: string }
  | { ok: false; reason: "permission" | "validation" | "error"; message?: string };

export type BrochureActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "permission" | "validation" | "not_found" | "error";
      message?: string;
    };

export type SignedUrlActionResult =
  | { ok: true; url: string; title: string }
  | { ok: false; reason: "permission" | "not_found" | "error"; message?: string };

type Gated = { user_id: string; org_id: string } | null;

async function gate(perm: Permission): Promise<Gated> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return null;
  if (!resolveForUser(user).has(perm)) return null;
  return { user_id: user.user.id, org_id: user.org_id };
}

const BROCHURES_PATH = "/admin/brochures";

/**
 * Step 1 of upload — validate perm/mime/size and hand back a scoped,
 * single-use signed upload URL. The Storage path is built from the
 * caller's org id inside the lib, never from client input.
 */
export async function requestBrochureUploadAction(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): Promise<RequestUploadResult> {
  const g = await gate("brochures:upload");
  if (!g) return { ok: false, reason: "permission" };
  if (typeof fileName !== "string" || !fileName.trim()) {
    return { ok: false, reason: "validation", message: "Missing file name" };
  }
  const r = await requestUploadUrl({
    organization_id: g.org_id,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
  });
  if (!r.ok) return r;
  return { ok: true, path: r.path, token: r.token, signed_url: r.signed_url };
}

/**
 * Step 3 of upload — the file is already in Storage at `path`; insert the
 * brochures row. `isPathInOrg` rejects a path that isn't under the
 * caller's org namespace (a client could replay another org's path).
 */
export async function finalizeBrochureAction(input: {
  path: string;
  file_size_bytes: number;
  mime_type: string;
  title: string;
  document_type: string;
  project_id: string | null;
  metadata: BrochureMetadataInput;
}): Promise<CreateBrochureActionResult> {
  const g = await gate("brochures:upload");
  if (!g) return { ok: false, reason: "permission" };
  if (typeof input?.path !== "string" || !isPathInOrg(g.org_id, input.path)) {
    return {
      ok: false,
      reason: "validation",
      message: "Upload path is not in your organization",
    };
  }
  const r = await createBrochure({
    organization_id: g.org_id,
    uploaded_by: g.user_id,
    document_type: input.document_type,
    title: input.title,
    file_path: input.path,
    file_size_bytes: input.file_size_bytes,
    mime_type: input.mime_type,
    project_id: input.project_id,
    metadata: input.metadata,
  });
  if (!r.ok) return r;
  revalidatePath(BROCHURES_PATH);
  return { ok: true, id: r.id };
}

export async function updateBrochureAction(input: {
  id: string;
  title?: string;
  document_type?: string;
  project_id?: string | null;
  metadata?: BrochureMetadataInput;
}): Promise<BrochureActionResult> {
  const g = await gate("brochures:upload");
  if (!g) return { ok: false, reason: "permission" };
  const r = await updateBrochureMetadata({
    organization_id: g.org_id,
    id: input.id,
    actor: g.user_id,
    title: input.title,
    document_type: input.document_type,
    project_id: input.project_id,
    metadata: input.metadata,
  });
  if (!r.ok) return r;
  revalidatePath(BROCHURES_PATH);
  return { ok: true };
}

export async function deleteBrochureAction(
  id: string,
): Promise<BrochureActionResult> {
  const g = await gate("brochures:delete");
  if (!g) return { ok: false, reason: "permission" };
  const r = await softDeleteBrochure({
    organization_id: g.org_id,
    id,
    actor: g.user_id,
  });
  if (!r.ok) return r;
  revalidatePath(BROCHURES_PATH);
  return { ok: true };
}

/** Resolve a 1h signed read URL for an in-org brochure. */
export async function getBrochureUrlAction(
  id: string,
): Promise<SignedUrlActionResult> {
  const g = await gate("brochures:view");
  if (!g) return { ok: false, reason: "permission" };
  return getBrochureSignedUrl(g.org_id, id);
}
