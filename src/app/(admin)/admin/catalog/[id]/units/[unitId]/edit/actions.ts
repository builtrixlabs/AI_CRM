"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import { updateUnit } from "@/lib/catalog/api";
import type { UnitStatus } from "@/lib/catalog/queries";

export type UnitActionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "permission"
        | "validation"
        | "stale"
        | "not_found"
        | "override_required"
        | "internal";
      message?: string;
    };

const VALID_STATUSES: ReadonlyArray<UnitStatus> = [
  "available",
  "held",
  "booked",
  "sold",
];

export async function saveUnitAction(
  property_id: string,
  unit_id: string,
  formData: FormData
): Promise<UnitActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) return { ok: false, error: "permission" };
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("units:edit")) {
    return { ok: false, error: "permission" };
  }
  const has_override = BASE_ROLE_PERMS[user.profile.base_role].has(
    "catalog:admin_override"
  );

  const expected_updated_at = String(formData.get("expected_updated_at") ?? "");
  if (!expected_updated_at) {
    return { ok: false, error: "validation", message: "missing_updated_at" };
  }

  const statusRaw = formData.get("status");
  const status =
    typeof statusRaw === "string" &&
    (VALID_STATUSES as ReadonlyArray<string>).includes(statusRaw)
      ? (statusRaw as UnitStatus)
      : undefined;

  const r = await updateUnit({
    unit_id,
    organization_id: user.org_id,
    expected_updated_at,
    caller_id: user.user.id,
    has_override,
    patch: {
      unit_no: stringOrUndef(formData.get("unit_no")),
      bhk: numOrUndef(formData.get("bhk")),
      floor: nullableNum(formData.get("floor")),
      price: numOrUndef(formData.get("price")),
      carpet_area_sqft: nullableNum(formData.get("carpet_area_sqft")),
      status,
    },
  });

  if (!r.ok) {
    return {
      ok: false,
      error:
        r.error === "stale" ||
        r.error === "not_found" ||
        r.error === "validation" ||
        r.error === "override_required"
          ? r.error
          : "internal",
      message: r.error === "validation" ? r.message : undefined,
    };
  }

  revalidatePath(`/admin/catalog/${property_id}`);
  redirect(`/admin/catalog/${property_id}`);
}

function stringOrUndef(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length === 0 ? undefined : t;
}

function numOrUndef(raw: FormDataEntryValue | null): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function nullableNum(
  raw: FormDataEntryValue | null
): number | null | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
