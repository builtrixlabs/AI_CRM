"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  createField,
  deleteField,
  updateField,
} from "@/lib/customfields/admin";
import {
  CustomFieldError,
  createFieldInputSchema,
  deleteFieldInputSchema,
  updateFieldInputSchema,
} from "@/lib/customfields/types";

export type CustomFieldActionResult<T = void> =
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
const boolFromForm = (raw: FormDataEntryValue | null): boolean => {
  if (typeof raw !== "string") return false;
  return raw === "true" || raw === "on" || raw === "1";
};

function optionsFromCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function customFieldsAction(
  formData: FormData,
): Promise<CustomFieldActionResult<{ id?: string }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }
  const perms = resolveForUser(user);
  if (!perms.has("tables:customize")) {
    return { ok: false, error: "permission" };
  }
  const actor_role = user.profile.base_role;
  const intent = stringOrUndef(formData.get("intent"));

  try {
    switch (intent) {
      case "create": {
        const parsed = createFieldInputSchema.safeParse({
          node_type: stringOrUndef(formData.get("node_type")),
          field_key: stringOrUndef(formData.get("field_key")),
          label: stringOrUndef(formData.get("label")),
          kind: stringOrUndef(formData.get("kind")),
          required: boolFromForm(formData.get("required")),
          options: optionsFromCsv(stringOrUndef(formData.get("options"))),
          sort_order: Number(formData.get("sort_order") ?? 0),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await createField({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/tables");
        return { ok: true, data: r };
      }
      case "update": {
        const parsed = updateFieldInputSchema.safeParse({
          id: stringOrUndef(formData.get("id")),
          label: stringOrUndef(formData.get("label")),
          required: formData.has("required")
            ? boolFromForm(formData.get("required"))
            : undefined,
          options: formData.has("options")
            ? optionsFromCsv(stringOrUndef(formData.get("options")))
            : undefined,
          sort_order: formData.has("sort_order")
            ? Number(formData.get("sort_order"))
            : undefined,
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await updateField({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/tables");
        return { ok: true, data: r };
      }
      case "delete": {
        const parsed = deleteFieldInputSchema.safeParse({
          id: stringOrUndef(formData.get("id")),
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            fieldErrors: fieldErrorsFromZod(parsed.error),
          };
        }
        const r = await deleteField({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        revalidatePath("/admin/tables");
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
    if (err instanceof CustomFieldError) {
      return { ok: false, error: "validation", message: err.message };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function customFieldsFormAction(formData: FormData): Promise<void> {
  await customFieldsAction(formData);
}
