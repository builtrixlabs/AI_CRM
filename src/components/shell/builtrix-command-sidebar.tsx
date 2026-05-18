"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Calendar,
  CheckSquare,
  GaugeCircle,
  LayoutDashboard,
  Layers,
  MapPin,
  MessageSquare,
  Phone,
  Sparkles,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/auth/rbac";
import type { RoleTier } from "@/lib/auth/role-tier";

type NavItem = {
  href: string;
  Icon: LucideIcon;
  label: string;
  /** Permission required to USE the destination — see CommandCenterSidebar for the rationale. */
  requires?: Permission;
  /** True when the destination is admin-surface (route-policy redirects non-admins). */
  adminSurface?: boolean;
};

type NavSection = {
  label?: string;
  items: NavItem[];
};

// ---------- AGENT nav (sales_rep, presales_rep, *_coordinator, etc.) ----------
// Focus: their queue + today's work. No admin/team-rollup affordances.
const AGENT_NAV: NavSection[] = [
  {
    items: [
      { href: "/dashboard", Icon: LayoutDashboard, label: "My Day" },
      { href: "/dashboard/leads", Icon: Users, label: "My Queue", requires: "leads:view" },
      { href: "/dashboard/site-visits", Icon: MapPin, label: "Site Visits", requires: "site_visits:view" },
      { href: "/dashboard/deals", Icon: Phone, label: "Calls & Deals", requires: "deals:view" },
      { href: "/dashboard/contacts", Icon: MessageSquare, label: "Conversations", requires: "contacts:view" },
    ],
  },
];

// ---------- MANAGER nav ----------
// Adds team rollup + pipeline + reports surfaces above the rep tools.
const MANAGER_NAV: NavSection[] = [
  {
    items: [
      { href: "/dashboard", Icon: GaugeCircle, label: "Command Center" },
      { href: "/dashboard/leads", Icon: Users, label: "Leads & Contacts", requires: "leads:view" },
      { href: "/dashboard/deals", Icon: Phone, label: "Deals & Calls", requires: "deals:view" },
      { href: "/dashboard/contacts", Icon: MessageSquare, label: "Conversations", requires: "contacts:view" },
      { href: "/dashboard/site-visits", Icon: MapPin, label: "Site Visits", requires: "site_visits:view" },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/admin/views", Icon: Layers, label: "Pipelines & Views", requires: "views:customize", adminSurface: true },
      { href: "/admin/system-health", Icon: Activity, label: "System Health", adminSurface: true },
    ],
  },
];

// ---------- ADMIN nav ----------
// Full operator surface + admin tools.
const ADMIN_NAV: NavSection[] = [
  {
    items: [
      { href: "/dashboard", Icon: Sparkles, label: "Command Center" },
      { href: "/dashboard/leads", Icon: Users, label: "Leads & Contacts", requires: "leads:view" },
      { href: "/dashboard/deals", Icon: Phone, label: "Deals & Calls", requires: "deals:view" },
      { href: "/dashboard/contacts", Icon: MessageSquare, label: "Conversations", requires: "contacts:view" },
      { href: "/dashboard/site-visits", Icon: MapPin, label: "Site Visits", requires: "site_visits:view" },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/admin/views", Icon: Layers, label: "Pipelines & Views", requires: "views:customize", adminSurface: true },
      { href: "/admin/system-health", Icon: Activity, label: "System Health", adminSurface: true },
    ],
  },
];

const FOOTER_NAV: NavItem[] = [
  { href: "/dashboard/settings", Icon: Settings, label: "Settings" },
];

const ADMIN_ALLOWED_TIERS: ReadonlySet<RoleTier> = new Set(["admin"]);

function navForTier(tier: RoleTier): NavSection[] {
  switch (tier) {
    case "admin":
      return ADMIN_NAV;
    case "manager":
      return MANAGER_NAV;
    case "agent":
    default:
      return AGENT_NAV;
  }
}

function isVisible(
  item: NavItem,
  tier: RoleTier,
  perms: ReadonlySet<string>,
): boolean {
  if (item.adminSurface && !ADMIN_ALLOWED_TIERS.has(tier)) return false;
  if (item.requires && !perms.has(item.requires)) return false;
  return true;
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Props = {
  tier: RoleTier;
  roleLabel: string;
  displayName: string | null;
  permissions?: readonly string[];
};

export function BuiltrixCommandSidebar({
  tier,
  roleLabel,
  displayName,
  permissions,
}: Props) {
  const pathname = usePathname();
  const perms = new Set<string>(permissions ?? []);
  const sections = navForTier(tier)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isVisible(item, tier, perms)),
    }))
    .filter((section) => section.items.length > 0);
  const footer = FOOTER_NAV.filter((item) => isVisible(item, tier, perms));
  const initials = computeInitials(displayName);

  return (
    <aside aria-label="Primary navigation" className="bcmd-sidebar">
      <Link
        href="/dashboard"
        className="bcmd-sidebar-brand"
        aria-label="Builtrix Command home"
      >
        <span className="bcmd-sidebar-brand-mark" aria-hidden="true">
          Bx
        </span>
        <span>
          <span className="bcmd-sidebar-brand-title">BUILTRIX</span>
          <span className="bcmd-sidebar-brand-subtitle block">
            Command · {tierShort(tier)}
          </span>
        </span>
      </Link>

      <div className="bcmd-sidebar-divider" />

      <nav className="flex flex-col gap-1" data-testid="bcmd-sidebar-nav">
        {sections.map((section, idx) => (
          <div key={section.label ?? `s${idx}`} className="flex flex-col gap-1">
            {section.label ? (
              <div className="bcmd-sidebar-section-label">{section.label}</div>
            ) : null}
            {section.items.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="bcmd-sidebar-divider" />

      <div className="flex flex-col gap-1">
        {footer.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
          />
        ))}
      </div>

      <div className="bcmd-sidebar-user">
        <span className="bcmd-sidebar-user-avatar" aria-hidden="true">
          {initials}
        </span>
        <div className="min-w-0">
          <div className="bcmd-sidebar-user-name truncate">
            {displayName ?? "Builtrix Member"}
          </div>
          <div className="bcmd-sidebar-user-meta truncate">{roleLabel}</div>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.Icon;
  return (
    <Link
      href={item.href}
      className="bcmd-sidebar-link"
      data-active={active ? "true" : "false"}
      aria-current={active ? "page" : undefined}
    >
      <Icon aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

function tierShort(tier: RoleTier): string {
  if (tier === "admin") return "ADMIN";
  if (tier === "manager") return "MANAGER";
  return "AGENT";
}

function computeInitials(name: string | null): string {
  if (!name) return "··";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Re-export icons for tests so they can assert visible nav items by label.
export const __testing = {
  AGENT_NAV,
  MANAGER_NAV,
  ADMIN_NAV,
  FOOTER_NAV,
  navForTier,
  isVisible,
  isActive,
};
