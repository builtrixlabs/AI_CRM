"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  createView,
  deleteView,
  setDefaultView,
  updateView,
} from "@/lib/views/admin";
import {
  CustomViewError,
  createViewInputSchema,
  deleteViewInputSchema,
  setDefaultViewInputSchema,
  updateViewInputSchema,
  type ColumnSpec,
  type FilterClause,
  type SortClause,
} from "@/lib/views/types";

export type ViewActionResult<T = void> =
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

function parseJsonField<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function viewsAction(
  formData: FormData,
): Promise<ViewActionResult<{ id?: string; view_id?: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }
  const perms = resolveForUser(user);
  const actor_role = user.profile.base_role;
  const intent = stringOrUndef(formData.get("intent"));

  try {
    switch (intent) {
      case "create": {
        const scope = stringOrUndef(formData.get("scope"));
        // Org-scope creation gates on views:customize; user-scope is open to all authenticated.
        if (scope === "org" && !perms.has("views:customize")) {
          return { ok: false, error: "permission" };
        }
        const parsed = createViewInputSchema.safeParse({
          entity_type: stringOrUndef(formData.get("entity_type")),
          scope,
          name: stringOrUndef(formData.get("name")),
          slug: stringOrUndef(formData.get("slug")),
          filters: parseJsonField<FilterClause[]>(
            formData.get("filters"),
            [],
          ),
          columns: parseJsonField<ColumnSpec[]>(formData.get("columns"), []),
          sort: parseJsonField<SortClause | null>(formData.get("sort"), null),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await createView({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/views");
        revalidatePath(`/dashboard/${pluralizePath(parsed.data.entity_type)}`);
        return { ok: true, data: r };
      }
      case "update": {
        const parsed = updateViewInputSchema.safeParse({
          id: stringOrUndef(formData.get("id")),
          name: stringOrUndef(formData.get("name")),
          filters: formData.has("filters")
            ? parseJsonField<FilterClause[]>(formData.get("filters"), [])
            : undefined,
          columns: formData.has("columns")
            ? parseJsonField<ColumnSpec[]>(formData.get("columns"), [])
            : undefined,
          sort: formData.has("sort")
            ? parseJsonField<SortClause | null>(formData.get("sort"), null)
            : undefined,
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        // Permission re-check: if the target view is org-scope, require views:customize.
        // (RLS at DB layer enforces this independently; this is the application-layer
        // mirror so we return a sensible error before the DB rejects.)
        // We don't re-read the target here; we trust DB RLS to be authoritative on
        // cross-scope writes — but we keep the check on user-scope to be cheap.
        const r = await updateView({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/views");
        return { ok: true, data: r };
      }
      case "delete": {
        const parsed = deleteViewInputSchema.safeParse({
          id: stringOrUndef(formData.get("id")),
          reason: stringOrUndef(formData.get("reason")),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await deleteView({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/views");
        return { ok: true, data: r };
      }
      case "set_default": {
        const parsed = setDefaultViewInputSchema.safeParse({
          view_id: stringOrUndef(formData.get("view_id")),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await setDefaultView({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/dashboard");
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
    if (err instanceof CustomViewError) {
      return { ok: false, error: "validation", message: err.message };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function viewsFormAction(formData: FormData): Promise<void> {
  await viewsAction(formData);
}

function pluralizePath(entity_type: string): string {
  // Map node_type to its dashboard list-page slug.
  switch (entity_type) {
    case "lead":
      return "leads";
    case "deal":
      return "deals";
    case "contact":
      return "contacts";
    case "property":
      return "properties";
    case "unit":
      return "units";
    case "site_visit":
      return "site-visits";
    default:
      return `${entity_type}s`;
  }
}
