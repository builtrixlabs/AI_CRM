import { NextResponse, type NextRequest } from "next/server";
import { withApiAudit } from "@/lib/api/audit-wrapper";
import {
  LOGIN_LIMIT,
  LOGIN_WINDOW_SECONDS,
  LOGIN_ACCOUNT_LIMIT,
  LOGIN_ACCOUNT_WINDOW_SECONDS,
  ipKey,
  loginAccountBucket,
  loginBucket,
} from "@/lib/auth/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

async function readEmail(req: NextRequest): Promise<string | null> {
  if (req.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = (await req.json()) as { email?: unknown };
      if (typeof body.email === "string" && body.email.trim().length > 0) {
        return body.email.trim().toLowerCase();
      }
    } catch {
      /* malformed body — treat as no email */
    }
  }
  return null;
}

async function auditRateLimited(
  axis: "ip" | "email",
  key: string
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.from("audit_log").insert({
      actor_id: SYSTEM_UUID,
      actor_type: "system",
      actor_role: "auth_rate_check",
      organization_id: null,
      workspace_id: null,
      table_name: "auth.users",
      record_id: SYSTEM_UUID,
      action: "auth.rate_limited",
      diff: { axis, key_hint: key.slice(0, 64) },
    });
  } catch {
    /* never block the 429 on audit write */
  }
}

async function handler(req: NextRequest): Promise<NextResponse> {
  const ip = ipKey(req);
  const email = await readEmail(req);

  // Per-account check fires first when present — credential-stuffing
  // attacks vary IP per attempt but target the same account.
  if (email) {
    const acct = await loginAccountBucket.consume(email);
    if (!acct.allowed) {
      await auditRateLimited("email", email);
      return NextResponse.json(
        {
          allowed: false,
          remaining: 0,
          limit: LOGIN_ACCOUNT_LIMIT,
          window_seconds: LOGIN_ACCOUNT_WINDOW_SECONDS,
          retry_after_seconds: Math.ceil(acct.retry_after_ms / 1000),
          axis: "email",
          error: "rate_limited",
        },
        { status: 429 }
      );
    }
  }

  const r = await loginBucket.consume(ip);
  if (!r.allowed) {
    await auditRateLimited("ip", ip);
    return NextResponse.json(
      {
        allowed: false,
        remaining: 0,
        limit: LOGIN_LIMIT,
        window_seconds: LOGIN_WINDOW_SECONDS,
        retry_after_seconds: Math.ceil(r.retry_after_ms / 1000),
        axis: "ip",
        error: "rate_limited",
      },
      { status: 429 }
    );
  }

  return NextResponse.json(
    {
      allowed: true,
      remaining: r.remaining,
      limit: LOGIN_LIMIT,
      window_seconds: LOGIN_WINDOW_SECONDS,
      retry_after_seconds: 0,
    },
    { status: 200 }
  );
}

export const POST = withApiAudit(handler, { permission: "auth.rate_check" });
