"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  issueToken,
  revokeToken,
  SISTER_PRODUCT_KINDS,
  type ProductKind,
} from "@/lib/integrations/sister-products/token";

type IssueResult =
  | { ok: true; token: string; last4: string; id: string }
  | { ok: false; error: string };

type RevokeResult = { ok: true } | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function issueTokenAction(
  form: FormData,
): Promise<IssueResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  if (user.profile.base_role !== "super_admin") {
    return { ok: false, error: "super_admin_only" };
  }

  const organization_id = String(form.get("organization_id") ?? "").trim();
  const product_kind = String(form.get("product_kind") ?? "").trim();
  if (!UUID_RE.test(organization_id)) {
    return { ok: false, error: "invalid_organization_id" };
  }
  if (!(SISTER_PRODUCT_KINDS as readonly string[]).includes(product_kind)) {
    return { ok: false, error: `invalid_product_kind:${product_kind}` };
  }

  try {
    const issued = await issueToken(getSupabaseAdmin(), {
      organization_id,
      product_kind: product_kind as ProductKind,
      created_by: user.user.id,
    });
    revalidatePath("/platform/sister-products");
    return {
      ok: true,
      token: issued.token,
      last4: issued.last4,
      id: issued.id,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "issue_failed",
    };
  }
}

export async function revokeTokenAction(id: string): Promise<RevokeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  if (user.profile.base_role !== "super_admin") {
    return { ok: false, error: "super_admin_only" };
  }
  if (!UUID_RE.test(id)) return { ok: false, error: "invalid_id" };

  try {
    await revokeToken(getSupabaseAdmin(), {
      id,
      revoked_by: user.user.id,
    });
    revalidatePath("/platform/sister-products");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "revoke_failed",
    };
  }
}
