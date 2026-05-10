import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

type Props = {
  /** profiles.display_name. May be null for fresh signups. */
  displayName: string | null;
  /** auth.users.email. Used as the tooltip and as the visible fallback. */
  email: string;
  /** Where the "Settings" link should navigate. Surface-specific. */
  settingsHref: string;
  /** Optional Tailwind tokens for the badge text — lets each surface match its
   *  header palette (emerald-200 for CP, neutral-400 for platform, etc.). */
  nameClassName?: string;
  /** Optional Tailwind tokens for the buttons (Settings link + Sign out). */
  buttonClassName?: string;
  /** Where to land after sign-out. */
  signOutRedirectTo?: string;
};

/**
 * Compact header widget shown in every authenticated layout. Pairs the user's
 * display name with a Settings link and a Sign out button so every role has a
 * way to log out and edit their profile from anywhere in the app.
 */
export function UserMenu({
  displayName,
  email,
  settingsHref,
  nameClassName = "text-xs text-neutral-300",
  buttonClassName = "rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs hover:bg-neutral-800",
  signOutRedirectTo = "/auth/sign-in",
}: Props) {
  const visibleName = displayName ?? email;
  return (
    <div className="flex items-center gap-3">
      <span
        data-testid="user-menu-name"
        className={nameClassName}
        title={email}
      >
        {visibleName}
      </span>
      <Link
        href={settingsHref}
        data-testid="user-menu-settings"
        className={buttonClassName}
        aria-label="Account settings"
      >
        Settings
      </Link>
      <SignOutButton
        className={buttonClassName}
        redirectTo={signOutRedirectTo}
      />
    </div>
  );
}
