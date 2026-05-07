import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Middleware will then redirect to the user's correct landing
  // (super_admin → /platform, org_admin → /admin, operational → /dashboard).
  return NextResponse.redirect(new URL("/", url.origin));
}
