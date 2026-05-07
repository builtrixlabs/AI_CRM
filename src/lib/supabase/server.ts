import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";

/**
 * Server-side Supabase client bound to the incoming request's cookies.
 * Use inside Server Components, Route Handlers, Server Actions.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Components cannot mutate cookies; safe to ignore.
            // The middleware refreshes session cookies in NextResponse.
          }
        }
      },
    },
  });
}
