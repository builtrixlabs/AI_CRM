import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { NewLeadButton } from "@/components/dashboard/new-lead-button";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const user = await getCurrentUser();
  const perms = user ? resolveForUser(user) : new Set<string>();
  const canCreate = perms.has("leads:create" as never);

  return (
    <main className="mx-auto max-w-3xl p-12">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        {canCreate ? <NewLeadButton /> : null}
      </header>
      <p className="mt-4 text-sm text-neutral-600">
        Press{" "}
        <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-xs font-medium">
          ⌘K
        </kbd>{" "}
        /{" "}
        <kbd className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-xs font-medium">
          Ctrl K
        </kbd>{" "}
        for the command palette.
      </p>
      <nav
        aria-label="Entity lists"
        className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        {perms.has("leads:view" as never) && (
          <Link
            href="/dashboard/leads"
            className="rounded-md border border-neutral-200 p-4 hover:border-neutral-400"
          >
            <div className="text-sm font-medium">Leads →</div>
            <div className="text-xs text-neutral-500">
              Pipeline + saved views
            </div>
          </Link>
        )}
        {perms.has("deals:view" as never) && (
          <Link
            href="/dashboard/deals"
            className="rounded-md border border-neutral-200 p-4 hover:border-neutral-400"
          >
            <div className="text-sm font-medium">Deals →</div>
            <div className="text-xs text-neutral-500">
              Stage timeline + bookings
            </div>
          </Link>
        )}
        {perms.has("contacts:view" as never) && (
          <Link
            href="/dashboard/contacts"
            className="rounded-md border border-neutral-200 p-4 hover:border-neutral-400"
          >
            <div className="text-sm font-medium">Contacts →</div>
            <div className="text-xs text-neutral-500">
              Buyer master + interaction history
            </div>
          </Link>
        )}
      </nav>
      <p className="mt-6 text-sm">
        <Link href="/dashboard/leads/demo" className="underline">
          View demo lead canvas →
        </Link>
      </p>
    </main>
  );
}
