// Server-only by virtue of `getSupabaseAdmin()` (admin client throws
// on browser-side import). No `server-only` pragma to keep vitest
// imports working through transitive deps.
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ENV_FALLBACK, SECRET_KINDS, type RedactedSecret, type SecretKind } from "./types";

/**
 * Read the redacted view of all secrets — last4 + rotated_at + which
 * source provides the value. Never returns the raw value.
 *
 * Caller must enforce super_admin permission BEFORE calling this
 * (server actions/components do that via getCurrentUser).
 */
export async function listSecretStatus(): Promise<RedactedSecret[]> {
  const client = getSupabaseAdmin();
  const { data, error } = await client
    .from("platform_secrets_redacted")
    .select("kind, last4, rotated_at");

  const dbRows = !error && Array.isArray(data) ? data : [];
  const dbByKind = new Map<string, { last4: string; rotated_at: string }>();
  for (const r of dbRows) {
    const row = r as { kind: string; last4: string; rotated_at: string };
    dbByKind.set(row.kind, { last4: row.last4, rotated_at: row.rotated_at });
  }

  const out: RedactedSecret[] = [];
  for (const kind of SECRET_KINDS) {
    const dbRow = dbByKind.get(kind);
    if (dbRow) {
      out.push({
        kind,
        last4: dbRow.last4,
        is_set: true,
        source: "db",
        rotated_at: dbRow.rotated_at,
      });
      continue;
    }
    const envName = ENV_FALLBACK[kind];
    const envValue = process.env[envName] ?? "";
    if (envValue.length > 0) {
      out.push({
        kind,
        last4: envValue.slice(-4),
        is_set: true,
        source: "env",
        rotated_at: null,
      });
      continue;
    }
    out.push({
      kind,
      last4: null,
      is_set: false,
      source: "none",
      rotated_at: null,
    });
  }
  return out;
}

export type UpsertSecretArgs = {
  kind: SecretKind;
  value: string;
  actor_id: string;
};

export async function upsertSecret(args: UpsertSecretArgs): Promise<void> {
  if (args.value.length < 8) {
    throw new Error("secret value must be at least 8 chars");
  }
  const client = getSupabaseAdmin();
  const last4 = args.value.slice(-4);
  const now = new Date().toISOString();

  const { error } = await client.from("platform_secrets").upsert({
    kind: args.kind,
    value: args.value,
    last4,
    created_by: args.actor_id,
    updated_by: args.actor_id,
    updated_at: now,
    rotated_at: now,
  });
  if (error) throw new Error(error.message);

  // Audit row — never log the raw value or the last4 of a rotation;
  // record only that a rotation happened + by whom.
  await client.from("audit_log").insert({
    actor_id: args.actor_id,
    actor_type: "user",
    actor_role: "super_admin",
    table_name: "platform_secrets",
    record_id: null, // no uuid PK
    action: "platform_secret_rotated",
    diff: { kind: args.kind, rotated_at: now },
  });
}
