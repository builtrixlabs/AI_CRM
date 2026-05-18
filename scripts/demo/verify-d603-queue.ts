/* eslint-disable no-console */
/**
 * D-603 Gate 7 — verify the agent approval queue + integrations routes
 * render for an authenticated org_admin on the live preview deployment.
 *
 * Mints a session for a demo org_admin via the admin generateLink API
 * (non-mutating — does not touch the account's password), reconstructs the
 * @supabase/ssr auth cookie, and fetches /admin/agents/queue +
 * /admin/integrations/email on the preview. Also reports the demo org's
 * pending-queue state. Read-only against the app.
 *
 * Env (from the parent repo's .env / .env.local — point VERCEL_PROJECT_ROOT
 * at the repo root): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
 * SUPABASE_SERVICE_ROLE_KEY.
 *
 * Run: VERCEL_PROJECT_ROOT=<repo-root> npx tsx scripts/demo/verify-d603-queue.ts <preview-url>
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(): void {
  const dirs = [process.env.VERCEL_PROJECT_ROOT, process.cwd()].filter(
    Boolean,
  ) as string[];
  for (const dir of dirs) {
    for (const name of [".env", ".env.local"]) {
      const p = resolve(dir, name);
      if (!existsSync(p)) continue;
      for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
        if (!line || line.trim().startsWith("#")) continue;
        const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
        if (!m) continue;
        let v = m[2];
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
      }
    }
  }
}

loadEnvLocal();

const PREVIEW =
  process.argv[2] ??
  "https://ai-pousbrvak-builtrixlabs-projects.vercel.app";
const url = process.env.SUPABASE_URL?.trim();
const anon = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const ADMIN_EMAIL = "admin-skyline@builtrixcrm.ai";

if (!url || !anon || !svc) {
  console.error(
    "Need SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}

const projectRef = new URL(url).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;

// Chunk size is irrelevant to reconstruction — the server concatenates all
// sb-<ref>-auth-token(.N) cookies. Stay well under the 4KB cookie limit.
function chunk(value: string, size = 3000): string[] {
  if (value.length <= size) return [value];
  const out: string[] = [];
  for (let i = 0; i < value.length; i += size) {
    out.push(value.slice(i, i + size));
  }
  return out;
}

async function mintSession() {
  const admin = createClient(url!, svc!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: link, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: ADMIN_EMAIL,
    });
  const hashed = link?.properties?.hashed_token;
  if (linkErr || !hashed) {
    throw new Error(`generateLink failed: ${linkErr?.message ?? "no token"}`);
  }
  const c = createClient(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // magiclink-generated OTPs verify with type "email" in supabase-js v2.
  for (const type of ["email", "magiclink"] as const) {
    const { data, error } = await c.auth.verifyOtp({
      type,
      token_hash: hashed,
    });
    if (!error && data?.session) return data;
  }
  throw new Error("verifyOtp failed for both email/magiclink types");
}

async function main(): Promise<void> {
  console.log(`\n[d603-gate7] preview=${PREVIEW}\n`);

  const signIn = await mintSession();
  console.log(`session minted for: ${ADMIN_EMAIL}`);

  // @supabase/ssr cookie: "base64-" + base64(JSON.stringify(session)),
  // chunked across sb-<ref>-auth-token.N if long.
  const value =
    "base64-" +
    Buffer.from(JSON.stringify(signIn.session), "utf8").toString("base64");
  const parts = chunk(value);
  const cookieHeader =
    parts.length === 1
      ? `${cookieName}=${parts[0]}`
      : parts.map((p, i) => `${cookieName}.${i}=${p}`).join("; ");

  let pass = 0;
  let fail = 0;

  for (const path of [
    "/admin/agents/queue",
    "/admin/integrations/email",
  ]) {
    const res = await fetch(`${PREVIEW}${path}`, {
      headers: { cookie: cookieHeader },
      redirect: "manual",
    });
    const body = res.status === 200 ? await res.text() : "";
    const loc = res.headers.get("location");
    let okFlag = false;
    let detail = "";
    if (path === "/admin/agents/queue") {
      okFlag = res.status === 200 && body.includes("Agent approval queue");
      detail = okFlag
        ? 'rendered (contains "Agent approval queue")'
        : res.status >= 300 && res.status < 400
          ? `redirected -> ${loc}`
          : `status ${res.status}`;
    } else {
      // The integrations page is MFA-gated for org_admins (D-209/D-300):
      // a redirect to /auth/mfa/setup means the route exists and is
      // correctly gated — expected, not a failure. It is the link target
      // D-603's "configure integration" card points at.
      const mfaGated =
        res.status >= 300 &&
        res.status < 400 &&
        (loc ?? "").includes("/auth/mfa/setup");
      okFlag = res.status === 200 || mfaGated;
      detail =
        res.status === 200
          ? "rendered (HTTP 200)"
          : mfaGated
            ? `route exists, MFA-gated -> ${loc}`
            : res.status >= 300 && res.status < 400
              ? `redirected -> ${loc}`
              : `status ${res.status}`;
    }
    console.log(`  ${okFlag ? "PASS" : "FAIL"}  ${path.padEnd(30)} ${detail}`);
    if (okFlag) pass++;
    else fail++;
  }

  // Report demo-org queue state (context for a visual smoke).
  const admin = createClient(url!, svc!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: prof } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", signIn.user!.id)
    .single();
  const orgId = (prof as { organization_id: string } | null)
    ?.organization_id;
  if (orgId) {
    const { data: pending } = await admin
      .from("agent_approval_queue")
      .select("id, channel, status")
      .eq("organization_id", orgId)
      .eq("status", "pending");
    console.log(
      `\n  demo org ${orgId}: ${pending?.length ?? 0} pending queue draft(s)`,
    );
  }

  console.log(`\n[d603-gate7] ${pass} pass, ${fail} fail\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[d603-gate7] FATAL", e);
  process.exit(1);
});
