import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { NewLeadButton } from "@/components/dashboard/new-lead-button";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const user = await getCurrentUser();
  const canCreate = user
    ? resolveForUser(user).has("leads:create")
    : false;

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
      <p className="mt-4 text-sm">
        <Link href="/dashboard/leads/demo" className="underline">
          View demo lead canvas →
        </Link>
      </p>
    </main>
  );
}
