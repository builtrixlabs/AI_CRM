"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { BASE_ROLE_PERMS } from "@/lib/auth/rbac";
import {
  createEndpoint,
  deleteEndpoint,
  sendTestDelivery,
  toggleEndpoint,
} from "@/lib/admin/webhooks";

export type WebhookActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: "permission" | "validation" | "internal"; message?: string };

async function gate() {
  const user = await getCurrentUser();
  if (!user || !user.org_id) return null;
  if (!BASE_ROLE_PERMS[user.profile.base_role].has("settings:manage_integrations")) {
    return null;
  }
  return { user_id: user.user.id, org_id: user.org_id };
}

export async function createWebhookAction(
  formData: FormData
): Promise<WebhookActionResult> {
  const g = await gate();
  if (!g) return { ok: false, error: "permission" };
  const name = formData.get("name");
  const url = formData.get("url");
  const eventsRaw = formData.getAll("event") as string[];
  if (typeof name !== "string" || typeof url !== "string") {
    return { ok: false, error: "validation", message: "name + url required" };
  }
  const r = await createEndpoint({
    organization_id: g.org_id,
    user_id: g.user_id,
    name,
    url,
    events: eventsRaw.length > 0 ? eventsRaw : ["lead.created"],
  });
  if (!r.ok) {
    return {
      ok: false,
      error:
        r.error === "name_required" || r.error === "invalid_url"
          ? "validation"
          : "internal",
      message: r.error,
    };
  }
  revalidatePath("/admin/webhooks");
  return { ok: true, id: r.id };
}

export async function toggleWebhookAction(
  id: string,
  enabled: boolean
): Promise<WebhookActionResult> {
  const g = await gate();
  if (!g) return { ok: false, error: "permission" };
  const r = await toggleEndpoint(id, g.org_id, enabled, g.user_id);
  if (!r.ok) return { ok: false, error: "internal", message: r.error };
  revalidatePath("/admin/webhooks");
  return { ok: true };
}

export async function deleteWebhookAction(id: string): Promise<WebhookActionResult> {
  const g = await gate();
  if (!g) return { ok: false, error: "permission" };
  const r = await deleteEndpoint(id, g.org_id, g.user_id);
  if (!r.ok) return { ok: false, error: "internal", message: r.error };
  revalidatePath("/admin/webhooks");
  return { ok: true };
}

export async function testWebhookAction(id: string): Promise<WebhookActionResult> {
  const g = await gate();
  if (!g) return { ok: false, error: "permission" };
  const r = await sendTestDelivery(id, g.org_id, g.user_id);
  if (!r.ok) return { ok: false, error: "internal", message: r.error };
  revalidatePath("/admin/webhooks");
  return { ok: true, id: r.delivery_id };
}
