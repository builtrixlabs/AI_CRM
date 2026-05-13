"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  Users,
  Building2,
  Phone,
  MessageSquare,
  Layers,
  Activity,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Visibility = "all" | "admin";

type NavItem = {
  href: string;
  Icon: LucideIcon;
  label: string;
  visibility: Visibility;
};

const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", Icon: Sparkles, label: "Command Center", visibility: "all" },
  { href: "/dashboard/leads", Icon: Users, label: "Leads & Contacts", visibility: "all" },
  { href: "/admin/inventory", Icon: Building2, label: "Inventory", visibility: "admin" },
  { href: "/dashboard/deals", Icon: Phone, label: "Deals & Calls", visibility: "all" },
  { href: "/dashboard/contacts", Icon: MessageSquare, label: "Communications", visibility: "all" },
  { href: "/admin/views", Icon: Layers, label: "Pipelines & Views", visibility: "admin" },
  { href: "/admin/system-health", Icon: Activity, label: "System Health", visibility: "admin" },
];

const FOOTER_NAV: NavItem[] = [
  { href: "/dashboard/settings", Icon: Settings, label: "Settings", visibility: "all" },
];

// Roles that route-policy.ts allows onto /admin/* + /settings/*. Anyone
// else gets silently redirected to /dashboard by middleware, so we hide
// admin-only icons for them to avoid dead clicks.
const ADMIN_ROLES = new Set([
  "super_admin",
  "org_owner",
  "org_admin",
]);

type Props = {
  /** Pass `user.profile.base_role` from the dashboard layout. `null` /
   *  undefined → treat as non-admin. */
  baseRole?: string | null;
};

export function CommandCenterSidebar({ baseRole }: Props) {
  const pathname = usePathname();
  const isAdmin = baseRole ? ADMIN_ROLES.has(baseRole) : false;
  const primaryItems = PRIMARY_NAV.filter(
    (item) => item.visibility === "all" || isAdmin,
  );
  const footerItems = FOOTER_NAV.filter(
    (item) => item.visibility === "all" || isAdmin,
  );

  return (
    <aside
      aria-label="Primary navigation"
      className="w-14 shrink-0 flex flex-col items-center py-4 border-r border-white/[0.04] bg-[#050714]/90 backdrop-blur sticky top-0 h-screen"
    >
      <Link
        href="/dashboard"
        aria-label="Builtrix home"
        className="cc-sigil-violet flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold tracking-wider"
      >
        Bx
      </Link>
      <nav className="mt-8 flex flex-1 flex-col gap-3">
        {primaryItems.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </nav>
      <div className="flex flex-col gap-3">
        {footerItems.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </div>
    </aside>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.Icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground hover:bg-white/[0.04]",
        active && "text-foreground bg-white/[0.04]"
      )}
    >
      <Icon
        className="h-[18px] w-[18px]"
        style={active ? { color: "var(--cc-violet-300)" } : undefined}
      />
      {active && (
        <span
          aria-hidden="true"
          className="absolute -right-[3px] top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full"
          style={{
            background: "var(--cc-violet-500)",
            boxShadow: "0 0 8px rgba(164,117,248,0.7)",
          }}
        />
      )}
    </Link>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
