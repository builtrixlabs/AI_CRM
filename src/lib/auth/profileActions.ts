"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  updateOwnProfile,
  updateProfileSchema,
} from "@/lib/auth/updateProfile";

export type ProfileFormResult =
  | { ok: true }
  | {
      ok: false;
      error: "permission" | "validation" | "unknown";
      message?: string;
    };

const REVALIDATE_PATHS = [
  "/dashboard/settings",
  "/cp/settings",
  "/admin/settings",
  "/platform/settings/profile",
] as const;

/**
 * Single server action that backs every "Your profile" page (dashboard, cp,
 * admin, platform). Each surface calls the same action so we have one
 * validation + audit path. We revalidate every profile page because the action
 * fires once per save (cheap) and revalidating just the caller's path leaves
 * stale display names visible if the user ever lands on a sibling surface.
 */
export async function updateOwnProfileAction(
  formData: FormData,
): Promise<ProfileFormResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };

  const raw = {
    display_name: (formData.get("display_name") ?? "").toString().trim(),
    phone: (formData.get("phone") ?? "").toString().trim() || undefined,
    theme: (formData.get("theme") ?? "system").toString(),
    notification_prefs: {
      email_enabled: formData.get("notif_email") === "on",
      in_app_enabled: formData.get("notif_in_app") === "on",
      digest_frequency: (
        formData.get("notif_digest")?.toString() ?? "off"
      ) as "off" | "daily" | "weekly",
    },
  };

  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    await updateOwnProfile(user.user.id, parsed.data);
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, error: "validation", message: err.message };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Update failed",
    };
  }

  for (const p of REVALIDATE_PATHS) revalidatePath(p);
  return { ok: true };
}
