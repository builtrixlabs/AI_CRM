import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { UserMenu } from "@/components/auth/user-menu";

const NAV = [
  { href: "/admin", label: "Cockpit" },
  { href: "/admin/onboarding", label: "Onboarding" },
  { href: "/admin/dashboards", label: "Dashboards" },
  { href: "/admin/tables", label: "Tables & fields" },
  { href: "/admin/agents", label: "AI agents" },
  { href: "/admin/directives", label: "Directives" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/system-health", label: "System health" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/integrations/voice-iq", label: "Voice IQ" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings/roles", label: "Roles" },
  { href: "/settings/integrations", label: "Integrations" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-neutral-900 text-neutral-50">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/admin" className="font-semibold tracking-tight">
            Builtrix · Admin
          </Link>
          {user ? (
            <UserMenu
              displayName={user.profile.display_name}
              email={user.user.email}
              settingsHref="/dashboard/settings"
              nameClassName="text-xs text-neutral-400"
              buttonClassName="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1 text-xs hover:bg-neutral-700"
            />
          ) : (
            <span className="text-xs text-neutral-400">org_admin</span>
          )}
        </div>
      </header>

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
            Account-management plane. Operational work happens on the dashboard.
          </p>
        </nav>
        <main>{children}</main>
      </div>

      <footer className="border-t mt-auto">
        <div className="mx-auto max-w-7xl px-6 py-3 text-xs text-neutral-500">
          Builtrix Labs · admin surface · D-005
        </div>
      </footer>
    </div>
  );
}
