"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { setFlag, type FlagValue } from "@/lib/platform/flags";

export type SetFlagActionResult =
  | { ok: true }
  | { ok: false; error: "permission" | "validation" | "internal"; message?: string };

function parseValue(raw: string, type: "boolean" | "number" | "string"): FlagValue | null {
  if (type === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  }
  if (type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n;
  }
  return raw;
}

export async function setFlagAction(
  key: string,
  raw_value: string,
  type: "boolean" | "number" | "string"
): Promise<SetFlagActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (user.profile.base_role !== "super_admin") {
    return { ok: false, error: "permission" };
  }
  const parsed = parseValue(raw_value, type);
  if (parsed === null) {
    return {
      ok: false,
      error: "validation",
      message: `value is not a valid ${type}`,
    };
  }
  const r = await setFlag(key, parsed, user.user.id);
  if (!r.ok) return { ok: false, error: "internal", message: r.error };
  revalidatePath("/platform/settings");
  return { ok: true };
}
