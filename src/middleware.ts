import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { decideRoute } from "@/lib/auth/route-policy";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

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
  const user = await getCurrentUser(supabase);

  const decision = decideRoute(user, request.nextUrl.pathname);

  if (decision.kind === "allow") return response;

  if (decision.kind === "unauthorized") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // redirect
  const url = request.nextUrl.clone();
  url.pathname = decision.target;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on every path except Next.js internals + static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
