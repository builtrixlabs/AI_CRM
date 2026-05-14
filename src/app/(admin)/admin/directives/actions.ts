"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  createCustomDirective,
  createDirectiveInputSchema,
  DirectiveAuthoringError,
  toggleDirective,
  toggleDirectiveInputSchema,
  type CreateDirectiveInput,
} from "@/lib/doe/authoring";
import type { ActionKind, TriggerKind } from "@/lib/doe/types";

export type DirectiveActionResult<T = void> =
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

function jsonOrEmpty(
  raw: FormDataEntryValue | null,
): Record<string, unknown> | undefined {
  const v = stringOrUndef(raw);
  if (!v) return undefined;
  try {
    const parsed = JSON.parse(v);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Single dispatcher for all directive-authoring intents
 * (`single-dispatcher-server-action` pattern, D-005).
 *
 * `intent` field selects the route. Each route validates payload, gates by
 * permission, calls into `src/lib/doe/authoring.ts`, returns the discriminated
 * union shape (`server-action-result-discriminated-union`).
 */
export async function directiveAction(
  formData: FormData,
): Promise<DirectiveActionResult<{ id?: string; code?: string; enabled?: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }

  const perms = resolveForUser(user);
  if (!perms.has("directives:author")) {
    return { ok: false, error: "permission" };
  }

  const intent = stringOrUndef(formData.get("intent"));

  const actor_role = user.profile.base_role;

  switch (intent) {
    case "toggle":
      return await runToggle(formData, user.org_id, user.user.id, actor_role);
    case "create":
      return await runCreate(formData, user.org_id, user.user.id, actor_role);
    default:
      return {
        ok: false,
        error: "validation",
        message: `Unknown intent: ${intent ?? "(missing)"}`,
      };
  }
}

async function runToggle(
  formData: FormData,
  caller_org_id: string,
  actor_id: string,
  actor_role: string,
): Promise<DirectiveActionResult<{ id: string; code: string; enabled: boolean }>> {
  const payload = {
    code: stringOrUndef(formData.get("code")),
    enabled: boolFromForm(formData.get("enabled")),
  };
  const parsed = toggleDirectiveInputSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    const result = await toggleDirective({
      caller_org_id,
      actor_id,
      actor_role,
      code: parsed.data.code,
      enabled: parsed.data.enabled,
    });
    revalidatePath("/admin/directives");
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof DirectiveAuthoringError && err.kind === "not_found") {
      // Same shape as cross-tenant — no existence leak.
      return {
        ok: false,
        error: "validation",
        message: "AI workflow not found",
      };
    }
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Form-action shim that returns void so it can be passed directly as
 * `<form action={...}>` in a Server Component. The full result is still
 * available via `directiveAction` for Client Components that need it.
 */
export async function directiveFormAction(formData: FormData): Promise<void> {
  await directiveAction(formData);
}

async function runCreate(
  formData: FormData,
  caller_org_id: string,
  actor_id: string,
  actor_role: string,
): Promise<DirectiveActionResult<{ id: string; code: string }>> {
  const trigger_kind = stringOrUndef(formData.get("trigger_kind")) as
    | TriggerKind
    | undefined;
  const action_kind = stringOrUndef(formData.get("action_kind")) as
    | ActionKind
    | undefined;

  const rawInput: Partial<CreateDirectiveInput> = {
    display_name: stringOrUndef(formData.get("display_name")),
    trigger_kind,
    trigger_config: jsonOrEmpty(formData.get("trigger_config")) ?? {},
    action_kind,
    action_config: jsonOrEmpty(formData.get("action_config")) ?? {},
    enabled: formData.has("enabled")
      ? boolFromForm(formData.get("enabled"))
      : true,
  };
  const tier = stringOrUndef(formData.get("tier"));
  if (tier) (rawInput as { tier?: string }).tier = tier;

  const parsed = createDirectiveInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    const result = await createCustomDirective({
      caller_org_id,
      actor_id,
      actor_role,
      input: parsed.data,
    });
    revalidatePath("/admin/directives");
    return { ok: true, data: result };
  } catch (err) {
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
