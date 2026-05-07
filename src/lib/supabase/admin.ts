import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (typeof window !== "undefined") {
  // Defense in depth: if this module is imported in a client bundle by mistake,
  // crash early rather than ship a service-role key to the browser.
  throw new Error(
    "src/lib/supabase/admin.ts must never be imported from client code."
  );
}

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client. Use ONLY for:
 *   - super_admin org provisioning flows
 *   - bootstrap-super-admin script
 *   - audit_log writes (no other path can INSERT into audit_log per RLS)
 *   - integration test seeding
 *
 * Never use for general user-data reads. Reads bypass RLS, which is the
 * one thing the constitution forbids without explicit `read_sensitive` audit.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase admin client requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  cached = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
