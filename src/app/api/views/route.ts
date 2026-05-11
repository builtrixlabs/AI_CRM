// D-413 AC-7 — programmatic dispatcher API for custom views.
//
// Mirrors the server-action `viewsAction` (see `/admin/views/actions.ts`)
// but accepts JSON over POST so external automation can create/update/delete
// views and set per-user defaults. Auth is via the Supabase session cookie
// (same as every other dashboard API route).
//
// Intents:
//   - create:       { intent, entity_type, scope, name, slug, filters?, columns?, sort? }
//   - update:       { intent, id, name?, filters?, columns?, sort? }
//   - delete:       { intent, id, reason? }
//   - set_default:  { intent, view_id }
//
// Response: { ok: true, data?: {...} } | { ok: false, error: ..., message?: ..., fieldErrors?: {...} }

import { NextResponse, type NextRequest } from "next/server";
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
} from "@/lib/views/types";

type DispatcherResult =
  | { ok: true; data?: unknown }
  | {
      ok: false;
      error: "auth" | "permission" | "validation" | "unknown";
      message?: string;
      fieldErrors?: Record<string, string>;
    };

function fieldErrorsFromZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export async function POST(req: NextRequest): Promise<NextResponse<DispatcherResult>> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "auth" }, { status: 401 });
  }
  if (!user.org_id) {
    return NextResponse.json(
      { ok: false, error: "validation", message: "User has no org" },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "validation", message: "Body must be JSON" },
      { status: 400 },
    );
  }

  const perms = resolveForUser(user);
  const actor_role = user.profile.base_role;
  const { intent: intentRaw, ...rest } = body;
  const intent = typeof intentRaw === "string" ? intentRaw : undefined;

  try {
    switch (intent) {
      case "create": {
        const scope = rest.scope;
        if (scope === "org" && !perms.has("views:customize")) {
          return NextResponse.json(
            { ok: false, error: "permission" },
            { status: 403 },
          );
        }
        const parsed = createViewInputSchema.safeParse(rest);
        if (!parsed.success) {
          return NextResponse.json(
            {
              ok: false,
              error: "validation",
              fieldErrors: fieldErrorsFromZod(parsed.error),
            },
            { status: 400 },
          );
        }
        const r = await createView({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        return NextResponse.json({ ok: true, data: r });
      }
      case "update": {
        const parsed = updateViewInputSchema.safeParse(rest);
        if (!parsed.success) {
          return NextResponse.json(
            {
              ok: false,
              error: "validation",
              fieldErrors: fieldErrorsFromZod(parsed.error),
            },
            { status: 400 },
          );
        }
        const r = await updateView({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        return NextResponse.json({ ok: true, data: r });
      }
      case "delete": {
        const parsed = deleteViewInputSchema.safeParse(rest);
        if (!parsed.success) {
          return NextResponse.json(
            {
              ok: false,
              error: "validation",
              fieldErrors: fieldErrorsFromZod(parsed.error),
            },
            { status: 400 },
          );
        }
        const r = await deleteView({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        return NextResponse.json({ ok: true, data: r });
      }
      case "set_default": {
        const parsed = setDefaultViewInputSchema.safeParse(rest);
        if (!parsed.success) {
          return NextResponse.json(
            {
              ok: false,
              error: "validation",
              fieldErrors: fieldErrorsFromZod(parsed.error),
            },
            { status: 400 },
          );
        }
        const r = await setDefaultView({
          caller_org_id: user.org_id,
          actor_id: user.user.id,
          actor_role,
          input: parsed.data,
        });
        return NextResponse.json({ ok: true, data: r });
      }
      default:
        return NextResponse.json(
          {
            ok: false,
            error: "validation",
            message: `Unknown intent: ${intent ?? "(missing)"}`,
          },
          { status: 400 },
        );
    }
  } catch (err) {
    if (err instanceof CustomViewError) {
      return NextResponse.json(
        { ok: false, error: "validation", message: err.message },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: "unknown",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
