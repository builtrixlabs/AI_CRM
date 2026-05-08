import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { NotificationPrefs } from "./types";

export const updateProfileSchema = z
  .object({
    display_name: z.string().min(1).max(120),
    phone: z
      .string()
      .max(40)
      .optional()
      .transform((v) => (v === "" || v == null ? null : v)),
    theme: z.enum(["light", "dark", "system"]),
    notification_prefs: z
      .object({
        email_enabled: z.boolean().optional(),
        in_app_enabled: z.boolean().optional(),
        digest_frequency: z.enum(["off", "daily", "weekly"]).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Update the caller's own profile fields. Audit row recorded with
 * before/after diff (raw new values are non-secret — display_name,
 * phone, prefs, theme — so they can live in the diff).
 */
export async function updateOwnProfile(
  user_id: string,
  input: UpdateProfileInput,
  client: SupabaseClient = getSupabaseAdmin()
): Promise<void> {
  const parsed = updateProfileSchema.parse(input);

  // Read previous values for the audit diff.
  const { data: before, error: readErr } = await client
    .from("profiles")
    .select("display_name, phone, theme, notification_prefs, organization_id")
    .eq("id", user_id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!before) throw new Error("profile not found");

  const beforeRow = before as {
    display_name: string;
    phone: string | null;
    theme: string;
    notification_prefs: NotificationPrefs | null;
    organization_id: string | null;
  };

  const { error: updErr } = await client
    .from("profiles")
    .update({
      display_name: parsed.display_name,
      phone: parsed.phone,
      theme: parsed.theme,
      notification_prefs: parsed.notification_prefs,
      updated_at: new Date().toISOString(),
      updated_by: user_id,
      updated_via: "manual",
    })
    .eq("id", user_id);
  if (updErr) throw updErr;

  await client.from("audit_log").insert({
    actor_id: user_id,
    actor_type: "user",
    actor_role: "self",
    organization_id: beforeRow.organization_id,
    table_name: "profiles",
    record_id: user_id,
    action: "profile_update",
    diff: {
      before: {
        display_name: beforeRow.display_name,
        phone: beforeRow.phone,
        theme: beforeRow.theme,
        notification_prefs: beforeRow.notification_prefs ?? {},
      },
      after: {
        display_name: parsed.display_name,
        phone: parsed.phone,
        theme: parsed.theme,
        notification_prefs: parsed.notification_prefs,
      },
    },
  });
}
