"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { issueToken, revokeToken } from "@/lib/sources/webform/tokens";
import { WebformSourceError } from "@/lib/sources/webform/types";

export type SourcesActionResult =
  | { ok: true; data?: { token?: string; endpoint_id?: string } }
  | {
      ok: false;
      error: "permission" | "validation" | "unknown";
      message?: string;
    };

const stringOrUndef = (raw: FormDataEntryValue | null): string | undefined => {
  if (raw == null || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
};

export async function sourcesAction(
  formData: FormData,
): Promise<SourcesActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }
  const perms = resolveForUser(user);
  if (!perms.has("sources:manage")) {
    return { ok: false, error: "permission" };
  }
  const actor_role = user.profile.base_role;
  const intent = stringOrUndef(formData.get("intent"));

  try {
    switch (intent) {
      case "issue": {
        const label = stringOrUndef(formData.get("label"));
        const workspace_id = stringOrUndef(formData.get("workspace_id")) ?? null;
        if (!label) {
          return { ok: false, error: "validation", message: "label required" };
        }
        const r = await issueToken({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          label,
          workspace_id,
        });
        revalidatePath("/admin/sources");
        return {
          ok: true,
          data: { token: r.token, endpoint_id: r.endpoint_id },
        };
      }
      case "revoke": {
        const id = stringOrUndef(formData.get("id"));
        if (!id) {
          return { ok: false, error: "validation", message: "id required" };
        }
        await revokeToken({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          id,
        });
        revalidatePath("/admin/sources");
        return { ok: true };
      }
      default:
        return {
          ok: false,
          error: "validation",
          message: `Unknown intent: ${intent ?? "(missing)"}`,
        };
    }
  } catch (err) {
    if (err instanceof WebformSourceError) {
      return { ok: false, error: "validation", message: err.message };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function sourcesFormAction(formData: FormData): Promise<void> {
  await sourcesAction(formData);
}
