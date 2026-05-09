import Link from "next/link";
import { Separator } from "@/components/ui/separator";

const NAV = [
  { href: "/admin", label: "Cockpit" },
  { href: "/admin/onboarding", label: "Onboarding" },
  { href: "/admin/dashboards", label: "Dashboards" },
  { href: "/admin/tables", label: "Tables & fields" },
  { href: "/admin/agents", label: "AI agents" },
  { href: "/admin/directives", label: "Directives" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/system-health", label: "System health" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/integrations/voice-iq", label: "Voice IQ" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings/roles", label: "Roles" },
  { href: "/settings/integrations", label: "Integrations" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-neutral-900 text-neutral-50">
        <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
          <Link href="/admin" className="font-semibold tracking-tight">
            Builtrix · Admin
          </Link>
          <span className="text-xs text-neutral-400">org_admin</span>
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
