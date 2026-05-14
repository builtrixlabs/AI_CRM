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
import type { Permission } from "@/lib/auth/rbac";

type NavItem = {
  href: string;
  Icon: LucideIcon;
  label: string;
  /**
   * Permission required to USE the destination. The sidebar hides items
   * the caller doesn't hold so we never show a button that silently
   * fails (the previous binary admin/non-admin filter leaked
   * /dashboard/leads to channel-partner roles that don't have
   * `leads:view`, and ignored org-level deny-overrides).
   *
   * Omit for items every authenticated dashboard user can reach
   * (Command Center home + Settings).
   */
  requires?: Permission;
  /**
   * True when the destination is under `/admin/*` or `/platform/*`. The
   * route-policy.ts middleware bounces non-admin users back to /dashboard
   * on these paths, so we additionally require the caller's base_role to
   * be in ADMIN_ROLES. Without this, a user who somehow holds the precise
   * permission but isn't in an admin role still hits a silent redirect.
   */
  adminSurface?: boolean;
};

const PRIMARY_NAV: NavItem[] = [
  // Always visible — every authenticated dashboard user.
  { href: "/dashboard", Icon: Sparkles, label: "Command Center" },
  // Leads / contacts / deals — operational read tier. Held by sales_rep,
  // manager, workspace_admin, read_only, org_admin/owner. NOT held by
  // channel_partner (cp:* only) or service_account (empty perm set).
  { href: "/dashboard/leads", Icon: Users, label: "Leads & Contacts", requires: "leads:view" },
  // Inventory admin — under /admin/*, requires `catalog:admin_override`
  // which only org_admin/owner + super_admin hold.
  { href: "/admin/inventory", Icon: Building2, label: "Inventory", requires: "catalog:admin_override", adminSurface: true },
  { href: "/dashboard/deals", Icon: Phone, label: "Deals & Calls", requires: "deals:view" },
  { href: "/dashboard/contacts", Icon: MessageSquare, label: "Communications", requires: "contacts:view" },
  // Pipeline / view customisation — under /admin/*, `views:customize`.
  { href: "/admin/views", Icon: Layers, label: "Pipelines & Views", requires: "views:customize", adminSurface: true },
  // System health — under /admin/*, admin-surface only. No specific
  // permission gate because route-policy already restricts the surface
  // and the page is org-level monitoring, not a per-perm feature.
  { href: "/admin/system-health", Icon: Activity, label: "System Health", adminSurface: true },
];

const FOOTER_NAV: NavItem[] = [
  // Settings is reachable for every authenticated user.
  { href: "/dashboard/settings", Icon: Settings, label: "Settings" },
];

// Roles that route-policy.ts allows onto /admin/* + /platform/*. Anyone
// else (manager, sales_rep, read_only, channel_partner, service_account)
// is silently redirected to /dashboard at the middleware layer.
const ADMIN_ROLES = new Set([
  "super_admin",
  "org_owner",
  "org_admin",
]);

type Props = {
  /** `user.profile.base_role` from the dashboard layout. Used to gate
   *  admin-surface items (the middleware-level surface gate). */
  baseRole?: string | null;
  /**
   * Effective permission strings for the caller, computed via
   * `Array.from(resolveForUser(user))` in the layout (the Cmd+K palette
   * already does this). Passed as `readonly string[]` so server →
   * client serialisation is trivially safe; the sidebar materialises a
   * Set internally for O(1) lookups.
   */
  permissions?: readonly string[];
};

function isVisible(
  item: NavItem,
  isAdmin: boolean,
  perms: ReadonlySet<string>,
): boolean {
  if (item.adminSurface && !isAdmin) return false;
  if (item.requires && !perms.has(item.requires)) return false;
  return true;
}

export function CommandCenterSidebar({ baseRole, permissions }: Props) {
  const pathname = usePathname();
  const isAdmin = baseRole ? ADMIN_ROLES.has(baseRole) : false;
  const perms = new Set<string>(permissions ?? []);
  const primaryItems = PRIMARY_NAV.filter((item) =>
    isVisible(item, isAdmin, perms),
  );
  const footerItems = FOOTER_NAV.filter((item) =>
    isVisible(item, isAdmin, perms),
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
