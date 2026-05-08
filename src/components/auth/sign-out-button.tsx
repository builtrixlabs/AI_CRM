"use client";

import { useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  /** Tailwind className for the button (caller can swap for the platform/dashboard look). */
  className?: string;
  /** Where to land after sign-out. Defaults to /auth/sign-in. */
  redirectTo?: string;
  /** Optional label override. */
  label?: string;
};

/**
 * Client-side sign-out button. Calls supabase.auth.signOut() (clears
 * the @supabase/ssr cookie on the client) then hard-navigates to
 * the redirectTo path so the middleware re-evaluates with no
 * session and serves the sign-in page.
 */
export function SignOutButton({
  className = "rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800",
  redirectTo = "/auth/sign-in",
  label = "Sign out",
}: Props) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
      } finally {
        window.location.href = redirectTo;
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={className}
      aria-label="Sign out"
    >
      {pending ? "Signing out…" : label}
    </button>
  );
}
