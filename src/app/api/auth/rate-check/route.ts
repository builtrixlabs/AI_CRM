import { NextResponse, type NextRequest } from "next/server";
import { withApiAudit } from "@/lib/api/audit-wrapper";
import {
  LOGIN_LIMIT,
  LOGIN_WINDOW_SECONDS,
  ipKey,
  loginBucket,
} from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: NextRequest): Promise<NextResponse> {
  const key = ipKey(req);
  const r = loginBucket.consume(key);
  const body = {
    allowed: r.allowed,
    remaining: r.remaining,
    limit: LOGIN_LIMIT,
    window_seconds: LOGIN_WINDOW_SECONDS,
    retry_after_seconds: Math.ceil(r.retry_after_ms / 1000),
  };
  if (!r.allowed) {
    return NextResponse.json(
      { ...body, error: "rate_limited" },
      { status: 429 }
    );
  }
  return NextResponse.json(body, { status: 200 });
}

export const POST = withApiAudit(handler, { permission: "auth.rate_check" });
