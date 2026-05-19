import { getCurrentUser } from "@/lib/auth/getCurrentUser";

/**
 * D-606 — banner rendered at the top of every page while the super
 * admin is impersonating an org. Server component — reads the
 * (cached) current user; renders nothing when impersonation is not
 * active.
 */
export async function ImpersonationBanner() {
  const user = await getCurrentUser();
  if (!user?.impersonation) return null;
  const { organization_name, organization_id, expires_at } = user.impersonation;
  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900"
      data-testid="impersonation-banner"
    >
      <div>
        <span className="font-semibold">IMPERSONATING</span>{" "}
        <span data-testid="impersonation-target">
          {organization_name ?? organization_id}
        </span>{" "}
        <span className="text-amber-700">
          · expires {new Date(expires_at).toLocaleTimeString()}
        </span>
      </div>
      <form action="/api/platform/impersonate/exit" method="post">
        <button
          type="submit"
          className="rounded-md border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-50"
          data-testid="impersonation-exit"
        >
          Exit impersonation
        </button>
      </form>
    </div>
  );
}
