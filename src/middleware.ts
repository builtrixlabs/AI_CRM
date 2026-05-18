import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { isMfaFresh } from "@/lib/auth/freshness";
import { decideRoute, type MfaState } from "@/lib/auth/route-policy";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";

/**
 * If `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
 * is missing on the deploy target, `@supabase/ssr`'s `createServerClient`
 * throws synchronously and Vercel wraps it as
 * `MIDDLEWARE_INVOCATION_FAILED` — the operator sees an opaque 500.
 *
 * We catch that misconfiguration up front and return a 500 whose body
 * tells the operator exactly which env var is missing, so a green build
 * with red runtime is debuggable in one step.
 *
 * Tracked by tests/middleware/env-validation.test.ts (regression for
 * the 2026-05-08 Vercel deploy that surfaced
 * `MIDDLEWARE_INVOCATION_FAILED`).
 */
function envConfigError(): NextResponse | null {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_KEY) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (missing.length === 0) return null;

  const body =
    `Server is misconfigured. Missing env var(s): ${missing.join(", ")}.\n` +
    `Set them in Vercel -> Project Settings -> Environment Variables ` +
    `(Production scope), then redeploy. See docs/architecture.md.`;
  return new NextResponse(body, {
    status: 500,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function middleware(request: NextRequest) {
  const envErr = envConfigError();
  if (envErr) return envErr;

  const response = NextResponse.next({ request });

  let user;
  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
    // getUser() also refreshes the access token if expiring; the new cookies
    // are written into `response` via the setAll callback above.
    user = await getCurrentUser(supabase);
  } catch (err) {
    // Any unexpected failure inside the Supabase client (e.g. malformed
    // JWT, network blip during refresh) lands here. Treat it as
    // "no session" so the user is bounced to /auth/sign-in instead of
    // seeing MIDDLEWARE_INVOCATION_FAILED.
    console.error(
      "[middleware] supabase client error:",
      err instanceof Error ? err.message : err
    );
    user = null;
  }

  const mfa_state: MfaState | undefined = user
    ? {
        enrolled: !!user.profile.mfa_enrolled_at,
        fresh: isMfaFresh(user.profile.mfa_verified_at ?? null),
        bypass: process.env.MFA_DEMO_MODE === "true",
      }
    : undefined;

  const decision = decideRoute(user, request.nextUrl.pathname, mfa_state);

  if (decision.kind === "allow") return response;

  if (decision.kind === "unauthorized") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // redirect — decision.target may be "/path" or "/path?query=value".
  // Assigning the whole string to url.pathname URL-encodes the "?" to "%3F"
  // and loses the query. Split first.
  const url = request.nextUrl.clone();
  const qIdx = decision.target.indexOf("?");
  if (qIdx === -1) {
    url.pathname = decision.target;
    url.search = "";
  } else {
    url.pathname = decision.target.slice(0, qIdx);
    url.search = decision.target.slice(qIdx); // includes leading "?"
  }
  return NextResponse.redirect(url);
}

export const config = {
  // Run on every path except Next.js internals + static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
