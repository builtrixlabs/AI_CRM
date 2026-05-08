import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

const NAV = [
  { href: "/platform", label: "Home" },
  { href: "/platform/organizations", label: "Organizations" },
  { href: "/platform/subscriptions", label: "Subscriptions" },
  { href: "/platform/analytics", label: "Analytics" },
  { href: "/platform/audit", label: "Audit log" },
  { href: "/platform/costs", label: "Costs" },
  { href: "/platform/tickets", label: "Tickets" },
  { href: "/platform/settings", label: "Settings" },
  { href: "/platform/settings/secrets", label: "Secrets" },
  { href: "/platform/settings/profile", label: "My profile" },
];

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const displayName = user?.profile.display_name ?? user?.user.email ?? "super_admin";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-neutral-950 text-neutral-50">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/platform" className="font-semibold tracking-tight">
            Builtrix · Platform
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-400" title={user?.user.email ?? ""}>
              {displayName}
            </span>
            <SignOutButton
              className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs hover:bg-neutral-800"
              redirectTo="/auth/sign-in"
            />
          </div>
        </div>
      </header>

      <div
        role="alert"
        className="bg-amber-50 border-b border-amber-300 text-amber-900"
      >
        <div className="mx-auto max-w-7xl px-6 py-3 text-sm">
          <strong>Builtrix internal platform.</strong> You have <em>zero</em>{" "}
          access to operational data inside any organization. Every privileged
          read is audited.
        </div>
      </div>

      <div className="mx-auto max-w-7xl flex-1 w-full px-6 py-8 grid grid-cols-[200px_1fr] gap-8">
        <nav className="text-sm">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block px-3 py-2 rounded-md hover:bg-neutral-100 text-neutral-700"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Separator className="my-4" />
          <p className="text-xs text-neutral-500 px-3">
            Constitution Principle II:
            <br />
            tenant isolation is sacred.
          </p>
        </nav>
        <main>{children}</main>
      </div>

      <footer className="border-t mt-auto">
        <div className="mx-auto max-w-7xl px-6 py-3 text-xs text-neutral-500">
          Builtrix Labs · platform surface · D-004
        </div>
      </footer>
    </div>
  );
}
