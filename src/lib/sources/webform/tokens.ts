import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { WebformSourceError, type WebformEndpointRow } from "./types";

const TOKEN_BYTES = 32;
const PREFIX_LEN = 8;

/** Token format: `wf_<urlsafe-base64(32-bytes)>`. Prefix = the first 8 chars. */
function generateToken(): { plaintext: string; prefix: string; hash: Buffer } {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const plaintext = `wf_${raw}`;
  const prefix = plaintext.slice(0, PREFIX_LEN);
  const hash = createHash("sha256").update(plaintext).digest();
  return { plaintext, prefix, hash };
}

export function hashToken(plaintext: string): Buffer {
  return createHash("sha256").update(plaintext).digest();
}

export type IssueTokenArgs = {
  caller_org_id: string;
  actor_id: string;
  actor_role: string;
  label: string;
  workspace_id?: string | null;
};

export async function issueToken(
  args: IssueTokenArgs,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{ endpoint_id: string; token: string; prefix: string }> {
  if (!args.label || args.label.length < 1 || args.label.length > 80) {
    throw new WebformSourceError("Label must be 1-80 chars", "validation");
  }
  const { plaintext, prefix, hash } = generateToken();

  const ins = await client
    .from("webform_endpoints")
    .insert({
      organization_id: args.caller_org_id,
      workspace_id: args.workspace_id ?? null,
      label: args.label,
      token_hash: `\\x${hash.toString("hex")}`,
      token_prefix: prefix,
      is_active: true,
      created_by: args.actor_id,
      created_via: "manual",
      updated_by: args.actor_id,
      updated_via: "manual",
    })
    .select("id")
    .single();
  const insErr = (ins as { error: { message: string } | null }).error;
  if (insErr) throw new WebformSourceError(insErr.message, "internal");
  const { id } = (ins as { data: { id: string } }).data;

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "webform_endpoints",
    record_id: id,
    action: "webform_endpoint_issued",
    diff: { label: args.label, prefix },
  });

  return { endpoint_id: id, token: plaintext, prefix };
}

export async function verifyToken(
  plaintext: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<{
  endpoint_id: string;
  organization_id: string;
  workspace_id: string | null;
} | null> {
  if (typeof plaintext !== "string" || !plaintext.startsWith("wf_")) {
    return null;
  }
  const hash = hashToken(plaintext);
  const { data, error } = await client
    .from("webform_endpoints")
    .select("id, organization_id, workspace_id, is_active, deleted_at")
    .eq("token_hash", `\\x${hash.toString("hex")}`)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as {
    id: string;
    organization_id: string;
    workspace_id: string | null;
    is_active: boolean;
    deleted_at: string | null;
  };
  if (!row.is_active) return null;
  return {
    endpoint_id: row.id,
    organization_id: row.organization_id,
    workspace_id: row.workspace_id,
  };
}

export async function revokeToken(
  args: { caller_org_id: string; actor_id: string; actor_role: string; id: string },
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const upd = await client
    .from("webform_endpoints")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
      updated_by: args.actor_id,
      updated_via: "manual",
    })
    .eq("id", args.id)
    .eq("organization_id", args.caller_org_id);
  const updErr = (upd as { error: { message: string } | null }).error;
  if (updErr) throw new WebformSourceError(updErr.message, "internal");

  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: args.actor_role,
    organization_id: args.caller_org_id,
    table_name: "webform_endpoints",
    record_id: args.id,
    action: "webform_endpoint_revoked",
    diff: {},
  });
}

export async function listEndpointsForOrg(
  organization_id: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<WebformEndpointRow[]> {
  const { data, error } = await client
    .from("webform_endpoints")
    .select(
      "id, organization_id, workspace_id, label, token_prefix, is_active, last_received_at, received_count, created_at",
    )
    .eq("organization_id", organization_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as WebformEndpointRow[];
}
