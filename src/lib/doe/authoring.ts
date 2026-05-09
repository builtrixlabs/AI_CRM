import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { DirectiveRow } from "./types";
import {
  createDirectiveInputSchema,
  defaultTierForAction,
  DirectiveAuthoringError,
  toggleDirectiveInputSchema,
  type CreateDirectiveInput,
  type ToggleDirectiveInput,
} from "./authoring-types";

/**
 * D-017 — Org-admin directive authoring (server-only helpers).
 *
 * Layered on top of D-011's runtime + tables. No schema change beyond the
 * RLS policy migration that lands alongside this module. Server actions
 * call into these helpers via the admin client + caller_org_id arg per
 * the `caller-org-filter-on-service-role-mutation` pattern (D-007).
 *
 * Constants and Zod schemas live in `./authoring-types.ts` so Client
 * Components can import them without pulling the Supabase admin client
 * into the browser bundle (`rsc-server-only-vs-client-safe-split`).
 */

const SYSTEM_VIA = "manual" as const;

// Re-export for compatibility with test imports that pre-date the split.
export {
  createDirectiveInputSchema,
  defaultTierForAction,
  DirectiveAuthoringError,
  toggleDirectiveInputSchema,
};
export type { CreateDirectiveInput, ToggleDirectiveInput };
export {
  ACTION_KIND_OPTIONS,
  TIER_OPTIONS,
  TRIGGER_KIND_OPTIONS,
} from "./authoring-types";

const CUSTOM_CODE_RE = /^C-(\d+)$/;

/**
 * Returns the next sequential `C-NN` code for the caller's org. Codes
 * monotonically increase even after deletions (no slot reuse).
 */
export async function nextCustomCode(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<string> {
  const { data, error } = await client
    .from("directives")
    .select("code")
    .eq("organization_id", organization_id)
    .like("code", "C-%");

  if (error) {
    throw new DirectiveAuthoringError(
      `Failed to load existing custom codes: ${error.message}`,
      "invalid",
    );
  }

  const rows = (data ?? []) as Array<{ code: string }>;
  let max = 0;
  for (const r of rows) {
    const match = CUSTOM_CODE_RE.exec(r.code);
    if (!match) continue;
    const n = Number.parseInt(match[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  const next = max + 1;
  return `C-${String(next).padStart(2, "0")}`;
}

/**
 * Look up the platform default for `code` (rows where organization_id IS NULL).
 * Returns null if no platform default exists with that code.
 */
async function findPlatformDefault(
  code: string,
  client: SupabaseClient,
): Promise<DirectiveRow | null> {
  const { data, error } = await client
    .from("directives")
    .select(
      "id, organization_id, code, display_name, trigger_kind, trigger_config, action_kind, action_config, tier, enabled",
    )
    .is("organization_id", null)
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return null;
  return (data as DirectiveRow | null) ?? null;
}

/**
 * Look up an org-specific row for `code`. Returns null if none exists.
 * Filters by caller_org_id per the caller-org-filter pattern.
 */
async function findOrgRow(
  organization_id: string,
  code: string,
  client: SupabaseClient,
): Promise<DirectiveRow | null> {
  const { data, error } = await client
    .from("directives")
    .select(
      "id, organization_id, code, display_name, trigger_kind, trigger_config, action_kind, action_config, tier, enabled",
    )
    .eq("organization_id", organization_id)
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return null;
  return (data as DirectiveRow | null) ?? null;
}

/**
 * Toggle a directive's `enabled` flag for the caller's org.
 *
 * If the row is a platform default (organization_id IS NULL), inserts an
 * override row with the same code carrying the requested `enabled` value.
 * If the row is already an org-specific row, UPDATEs in place.
 *
 * Writes one `audit_log` row with `action='directive_toggled'`.
 *
 * Cross-tenant guard: every read/write filters by `caller_org_id`. Toggling
 * a code that doesn't exist as either a platform default or an own-org row
 * throws `DirectiveAuthoringError(kind: 'not_found')` — same shape as a
 * cross-tenant attempt to toggle another org's custom code, so existence
 * isn't leaked.
 */
export async function toggleDirective(
  args: {
    caller_org_id: string;
    actor_id: string;
    /** Caller's base_role — stamped on the audit_log row for fidelity. */
    actor_role: string;
    code: string;
    enabled: boolean;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string; code: string; enabled: boolean }> {
  const own = await findOrgRow(args.caller_org_id, args.code, client);

  if (own) {
    const previous = own.enabled;
    const upd = await client
      .from("directives")
      .update({
        enabled: args.enabled,
        updated_at: new Date().toISOString(),
        updated_by: args.actor_id,
        updated_via: SYSTEM_VIA,
      })
      .eq("id", own.id)
      .eq("organization_id", args.caller_org_id);

    const updErr = (upd as { error: { message: string } | null }).error;
    if (updErr) throw new DirectiveAuthoringError(updErr.message, "invalid");

    await client.from("audit_log").insert({
      actor_id: args.actor_id,
      actor_type: "user",
      actor_role: args.actor_role,
      organization_id: args.caller_org_id,
      table_name: "directives",
      record_id: own.id,
      action: "directive_toggled",
      diff: { code: args.code, from: previous, to: args.enabled },
    });

    return { id: own.id, code: own.code, enabled: args.enabled };
  }

  const platform = await findPlatformDefault(args.code, client);
  if (!platform) {
    throw new DirectiveAuthoringError(
      `Directive not found: ${args.code}`,
      "not_found",
    );
  }

  // Trust boundary: platform-default rows are written exclusively by
  // super_admin and migrations. We forward trigger_config / action_config
  // verbatim. A compromised platform default would propagate to every org
  // that overrides it — accepted because super_admin is inside the trust
  // boundary per Constitution VII.
  const insertResult = await client
    .from("directives")
    .insert({
      organization_id: args.caller_org_id,
      code: platform.code,
      display_name: platform.display_name,
      trigger_kind: platform.trigger_kind,
      trigger_config: platform.trigger_config,
      action_kind: platform.action_kind,
      action_config: platform.action_config,
      tier: platform.tier,
      enabled: args.enabled,
      created_by: args.actor_id,
      created_via: SYSTEM_VIA,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .select("id")
    .single();

  const insErr = (insertResult as { error: { message: string } | null }).error;
  if (insErr) throw new DirectiveAuthoringError(insErr.message, "invalid");
  const inserted = (insertResult as { data: { id: string } }).data;

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: args.caller_org_id,
    table_name: "directives",
    record_id: inserted.id,
    action: "directive_toggled",
    diff: {
      code: args.code,
      from: platform.enabled,
      to: args.enabled,
      origin: "override_inserted",
    },
  });

  return { id: inserted.id, code: platform.code, enabled: args.enabled };
}

/**
 * Create a new custom directive for the caller's org. Generates the next
 * `C-NN` code automatically; defaults the tier from `action_kind` when not
 * explicitly provided. Writes one audit_log row with
 * `action='directive_created'`.
 */
export async function createCustomDirective(
  args: {
    caller_org_id: string;
    actor_id: string;
    /** Caller's base_role — stamped on the audit_log row for fidelity. */
    actor_role: string;
    input: CreateDirectiveInput;
  },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ id: string; code: string }> {
  const code = await nextCustomCode(args.caller_org_id, client);
  const tier = args.input.tier ?? defaultTierForAction(args.input.action_kind);

  const ins = await client
    .from("directives")
    .insert({
      organization_id: args.caller_org_id,
      code,
      display_name: args.input.display_name,
      trigger_kind: args.input.trigger_kind,
      trigger_config: args.input.trigger_config ?? {},
      action_kind: args.input.action_kind,
      action_config: args.input.action_config ?? {},
      tier,
      enabled: args.input.enabled ?? true,
      created_by: args.actor_id,
      created_via: SYSTEM_VIA,
      updated_by: args.actor_id,
      updated_via: SYSTEM_VIA,
    })
    .select("id")
    .single();

  const insErr = (ins as { error: { message: string } | null }).error;
  if (insErr) throw new DirectiveAuthoringError(insErr.message, "invalid");
  const inserted = (ins as { data: { id: string } }).data;

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: "org_admin",
    organization_id: args.caller_org_id,
    table_name: "directives",
    record_id: inserted.id,
    action: "directive_created",
    diff: {
      code,
      display_name: args.input.display_name,
      trigger_kind: args.input.trigger_kind,
      action_kind: args.input.action_kind,
      tier,
    },
  });

  return { id: inserted.id, code };
}

/**
 * Resolve the effective list of directives for the caller's org: platform
 * defaults UNION own-org rows, deduped by `code` with org rows winning.
 *
 * Used by the directive-list page (Section 1). Reads only — no audit row.
 */
export type EffectiveDirective = DirectiveRow & {
  origin: "platform_default" | "override" | "custom";
};

export async function listEffectiveDirectives(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<EffectiveDirective[]> {
  // Two parallel queries instead of `.or(\`...,organization_id.eq.${id}\`)`.
  // PostgREST does not parameterize the OR-clause string, so propagating the
  // template-literal pattern is fragile (security scan M1, D-017). Splitting
  // into two .eq()/.is() queries is fully parameterized.
  const COLS =
    "id, organization_id, code, display_name, trigger_kind, trigger_config, action_kind, action_config, tier, enabled";
  const [platformResult, ownResult] = await Promise.all([
    client.from("directives").select(COLS).is("organization_id", null).is("deleted_at", null),
    client
      .from("directives")
      .select(COLS)
      .eq("organization_id", organization_id)
      .is("deleted_at", null),
  ]);

  if (platformResult.error || ownResult.error) return [];

  const rows = [
    ...((platformResult.data ?? []) as DirectiveRow[]),
    ...((ownResult.data ?? []) as DirectiveRow[]),
  ];
  const platformByCode = new Map<string, DirectiveRow>();
  const orgByCode = new Map<string, DirectiveRow>();
  for (const r of rows) {
    if (r.organization_id == null) platformByCode.set(r.code, r);
    else orgByCode.set(r.code, r);
  }

  const out: EffectiveDirective[] = [];
  // Org rows: either an override of a platform default, or a custom (C-*).
  for (const [code, r] of orgByCode.entries()) {
    const isOverride = platformByCode.has(code);
    out.push({ ...r, origin: isOverride ? "override" : "custom" });
  }
  // Platform defaults that haven't been overridden.
  for (const [code, r] of platformByCode.entries()) {
    if (orgByCode.has(code)) continue;
    out.push({ ...r, origin: "platform_default" });
  }
  out.sort((a, b) => a.code.localeCompare(b.code));
  return out;
}

/**
 * Recent invocations for the caller's org. Reads via the user-scoped
 * client when available so RLS does the isolation; falls back to the
 * admin client for tests.
 */
export type RecentInvocationRow = {
  id: string;
  ts: string;
  directive_id: string;
  outcome: string;
  subject_node_id: string | null;
  details: Record<string, unknown> | null;
  code: string;
  display_name: string;
};

export async function listRecentInvocations(
  organization_id: string,
  limit: number,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<RecentInvocationRow[]> {
  const { data, error } = await client
    .from("directive_invocations")
    .select(
      "id, ts, directive_id, outcome, subject_node_id, details, directives!inner(code,display_name)",
    )
    .eq("organization_id", organization_id)
    .order("ts", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  type RawRow = {
    id: string;
    ts: string;
    directive_id: string;
    outcome: string;
    subject_node_id: string | null;
    details: Record<string, unknown> | null;
    directives:
      | { code: string; display_name: string }
      | Array<{ code: string; display_name: string }>
      | null;
  };

  return (data as unknown as RawRow[]).map((r) => {
    const dir = Array.isArray(r.directives) ? r.directives[0] : r.directives;
    return {
      id: r.id,
      ts: r.ts,
      directive_id: r.directive_id,
      outcome: r.outcome,
      subject_node_id: r.subject_node_id,
      details: r.details,
      code: dir?.code ?? "(unknown)",
      display_name: dir?.display_name ?? "(unknown)",
    };
  });
}

