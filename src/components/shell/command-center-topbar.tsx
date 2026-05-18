"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bell, ChevronDown, LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  displayName: string | null;
};

export function CommandCenterTopbar({ displayName }: Props) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-white/[0.04] bg-[#07091A]/85 px-6 backdrop-blur text-sm">
      <div className="flex items-center gap-3 text-muted-foreground min-w-0">
        <span className="cc-live-dot" aria-hidden="true" />
        <span
          className="cc-eyebrow"
          style={{ color: "var(--cc-mint-300)" }}
        >
          LIVE
        </span>
        <span className="hidden md:inline cc-eyebrow cc-eyebrow-soft truncate">
          12 agents online · 104,238 leads
        </span>
      </div>
      <div className="flex items-center gap-3">
        <WorkspaceSwitcher />
        <button
          type="button"
          aria-label="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
        >
          <Bell className="h-4 w-4" />
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--cc-amber-500)" }}
          />
        </button>
        <SignOutIconButton />
        <AvatarChip displayName={displayName} />
      </div>
    </header>
  );
}

function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-haspopup="menu"
      className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs hover:border-white/[0.12]"
    >
      <span className="cc-eyebrow cc-eyebrow-soft">Workspace</span>
      <span className="font-medium">Casagrand · Chennai South</span>
      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}

/**
 * Sign-out button rendered as an icon in the topbar. Restores the logout
 * affordance D-500 dropped when CommandCenterTopbar replaced the prior
 * <UserMenu>. Mirrors src/components/auth/sign-out-button.tsx behaviour:
 *   - browser-side supabase.auth.signOut() clears the @supabase/ssr cookie
 *   - then window.location.href hard-navigates so the middleware
 *     re-evaluates with no session and renders /auth/sign-in.
 */
function SignOutIconButton() {
  const [pending, startTransition] = useTransition();
  function handleClick() {
    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
      } catch {
        // best-effort — the hard-nav below clears the SSR cookie round-trip.
      } finally {
        window.location.href = "/auth/sign-in";
      }
    });
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Sign out"
      title="Sign out"
      data-testid="topbar-sign-out"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.04] disabled:opacity-60"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}

function AvatarChip({ displayName }: { displayName: string | null }) {
  const initials = computeInitials(displayName);
  return (
    <Link
      href="/dashboard/settings"
      aria-label="Profile and settings"
      className="cc-sigil-amber flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
    >
      {initials}
    </Link>
  );
}

function computeInitials(name: string | null): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
