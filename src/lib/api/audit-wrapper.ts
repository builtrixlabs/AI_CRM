import type { NextRequest, NextResponse } from "next/server";
import { recordApiAudit } from "@/lib/platform/api-audit";

export type ApiAuditOptions = {
  /** Static permission name documented for this route, if any. */
  permission?: string;
  /** Override the path recorded (default: req.nextUrl.pathname). */
  path?: string;
  /** Static org_id to attach. Most routes leave this null and look it up
   *  inside the handler; the wrapper accepts a derive function for the
   *  authenticated case. */
  organization_id?: string | null;
};

type ApiHandler = (req: NextRequest) => Promise<NextResponse> | NextResponse;

/**
 * Wrap a Next.js Route Handler so every request lands an `api_audit_log`
 * row. Latency captured around the handler. Status comes from the
 * handler's response. Best-effort — log-write failure is logged to
 * stderr and does not affect the response.
 *
 * Usage:
 *   export const POST = withApiAudit(handler, { permission: 'events.inbox.write' });
 */
export function withApiAudit(
  handler: ApiHandler,
  options: ApiAuditOptions = {}
): ApiHandler {
  return async (req: NextRequest) => {
    const start = Date.now();
    let response: NextResponse;
    try {
      response = await handler(req);
    } catch (err) {
      // Mark as 500 in audit + rethrow so the framework's error path runs.
      const latency_ms = Date.now() - start;
      void recordApiAudit({
        method: req.method,
        path: options.path ?? req.nextUrl.pathname,
        status_code: 500,
        ip: extractIp(req),
        user_agent: req.headers.get("user-agent"),
        latency_ms,
        permission_checked: options.permission ?? null,
        organization_id: options.organization_id ?? null,
      });
      throw err;
    }

    const latency_ms = Date.now() - start;
    void recordApiAudit({
      method: req.method,
      path: options.path ?? req.nextUrl.pathname,
      status_code: response.status,
      ip: extractIp(req),
      user_agent: req.headers.get("user-agent"),
      latency_ms,
      permission_checked: options.permission ?? null,
      organization_id: options.organization_id ?? null,
    });
    return response;
  };
}

function extractIp(req: NextRequest): string | null {
  // Vercel sets `x-forwarded-for`; first hop is the client.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  const real = req.headers.get("x-real-ip");
  return real ?? null;
}
