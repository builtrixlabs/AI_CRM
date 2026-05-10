"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { updateProperty } from "@/lib/catalog/api";

export type PropertyActionResult =
  | { ok: true }
  | {
      ok: false;
      error: "permission" | "validation" | "stale" | "not_found" | "internal";
      message?: string;
    };

export async function savePropertyAction(
  property_id: string,
  formData: FormData
): Promise<PropertyActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return { ok: false, error: "permission" };
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("properties:edit")) {
    return { ok: false, error: "permission" };
  }

  const expected_updated_at = String(formData.get("expected_updated_at") ?? "");
  if (!expected_updated_at) {
    return { ok: false, error: "validation", message: "missing_updated_at" };
  }

  const r = await updateProperty({
    property_id,
    organization_id: user.org_id,
    expected_updated_at,
    caller_id: user.user.id,
    patch: {
      name: stringOrUndef(formData.get("name")),
      city: stringOrUndef(formData.get("city")),
      address: nullableString(formData.get("address")),
      rera_number: nullableString(formData.get("rera_number")),
    },
  });

  if (!r.ok) {
    return {
      ok: false,
      error:
        r.error === "stale" || r.error === "not_found" || r.error === "validation"
          ? r.error
          : "internal",
      message: r.error === "validation" ? r.message : undefined,
    };
  }

  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/${property_id}`);
  redirect(`/admin/catalog/${property_id}`);
}

function stringOrUndef(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length === 0 ? undefined : t;
}

function nullableString(raw: FormDataEntryValue | null): string | null | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length === 0 ? null : t;
}
