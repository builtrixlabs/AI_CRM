"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  createDashboard,
  deleteDashboard,
  updateDashboardLayout,
} from "@/lib/dashboards/admin";
import {
  DashboardError,
  WIDGET_TYPES,
  createDashboardInputSchema,
  deleteDashboardInputSchema,
  updateLayoutInputSchema,
  type WidgetType,
} from "@/lib/dashboards/types";

export type DashboardActionResult<T = void> =
  | { ok: true; data?: T }
  | {
      ok: false;
      error: "permission" | "validation" | "unknown";
      fieldErrors?: Record<string, string>;
      message?: string;
    };

function fieldErrorsFromZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

const stringOrUndef = (raw: FormDataEntryValue | null): string | undefined => {
  if (raw == null || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
};

function widgetsFromForm(formData: FormData): Array<{ type: WidgetType }> {
  const out: Array<{ type: WidgetType }> = [];
  const all = formData.getAll("widget");
  for (const v of all) {
    if (typeof v !== "string") continue;
    if (WIDGET_TYPES.includes(v as WidgetType)) {
      out.push({ type: v as WidgetType });
    }
  }
  return out;
}

export async function dashboardsAction(
  formData: FormData,
): Promise<DashboardActionResult<{ id?: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }
  const perms = resolveForUser(user);
  if (!perms.has("dashboards:customize")) {
    return { ok: false, error: "permission" };
  }
  const actor_role = user.profile.base_role;
  const intent = stringOrUndef(formData.get("intent"));

  try {
    switch (intent) {
      case "create": {
        const widgets = widgetsFromForm(formData);
        const parsed = createDashboardInputSchema.safeParse({
          name: stringOrUndef(formData.get("name")),
          layout: { widgets },
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await createDashboard({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/dashboards");
        return { ok: true, data: r };
      }
      case "update_layout": {
        const widgets = widgetsFromForm(formData);
        const parsed = updateLayoutInputSchema.safeParse({
          id: stringOrUndef(formData.get("id")),
          name: stringOrUndef(formData.get("name")),
          layout: { widgets },
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await updateDashboardLayout({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/dashboards");
        revalidatePath(`/admin/dashboards/${parsed.data.id}`);
        return { ok: true, data: r };
      }
      case "delete": {
        const parsed = deleteDashboardInputSchema.safeParse({
          id: stringOrUndef(formData.get("id")),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await deleteDashboard({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/dashboards");
        return { ok: true, data: r };
      }
      default:
        return {
          ok: false,
          error: "validation",
          message: `Unknown intent: ${intent ?? "(missing)"}`,
        };
    }
  } catch (err) {
    if (err instanceof DashboardError) {
      return { ok: false, error: "validation", message: err.message };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function dashboardsFormAction(
  formData: FormData,
): Promise<void> {
  await dashboardsAction(formData);
}
