import type { Command } from "./types";

/**
 * V0 Cmd+K catalog. Locked literal per directive 008; adding/removing
 * requires a Plan-Mode-reviewed amendment.
 *
 * D-617 (V6 Phase 1) amendment: the 12 `placeholder`-kind shortcuts are
 * resolved to real `navigate` destinations (or stripped). The
 * `/dashboard/placeholder/[slug]` route and the `placeholder` command
 * kind are removed. `account-keyboard-shortcuts` (mis-wired, no real
 * destination) is removed.
 */
export const COMMANDS = [
  // ── Navigation ────────────────────────────────────────────────────────────
  {
    id: "nav-dashboard",
    label: "Go to Dashboard",
    group: "navigation",
    kind: "navigate",
    target: "/dashboard",
    hint: "G D",
  },
  {
    id: "nav-demo-lead",
    label: "View demo lead canvas",
    group: "navigation",
    kind: "navigate",
    target: "/dashboard/leads/demo",
    hint: "G L D",
  },
  {
    id: "nav-admin",
    label: "Go to Admin cockpit",
    group: "navigation",
    kind: "navigate",
    target: "/admin",
    requires: ["organizations:edit"],
  },
  {
    id: "nav-onboarding",
    label: "Resume onboarding",
    group: "navigation",
    kind: "navigate",
    target: "/admin/onboarding",
    requires: ["organizations:edit"],
  },
  {
    id: "nav-admin-directives",
    label: "Admin · AI Workflows",
    group: "navigation",
    kind: "navigate",
    target: "/admin/directives",
    requires: ["directives:author"],
  },
  {
    id: "nav-admin-agents",
    label: "Admin · AI agents",
    group: "navigation",
    kind: "navigate",
    target: "/admin/agents",
    requires: ["agents:provision"],
  },
  {
    id: "nav-admin-tables",
    label: "Admin · Tables & fields",
    group: "navigation",
    kind: "navigate",
    target: "/admin/tables",
    requires: ["tables:customize"],
  },
  {
    id: "nav-admin-dashboards",
    label: "Admin · Dashboards",
    group: "navigation",
    kind: "navigate",
    target: "/admin/dashboards",
    requires: ["dashboards:customize"],
  },
  {
    id: "nav-audit",
    label: "Open audit log",
    group: "navigation",
    kind: "navigate",
    target: "/admin/audit",
    requires: ["audit:view"],
  },
  {
    id: "nav-platform",
    label: "Go to Platform home",
    group: "navigation",
    kind: "navigate",
    target: "/platform",
    requires: ["platform:manage"],
  },
  {
    id: "nav-settings-users",
    label: "Settings · Users",
    group: "navigation",
    kind: "navigate",
    target: "/settings/users",
    requires: ["settings:manage_users"],
  },
  {
    id: "nav-settings-integrations",
    label: "Settings · Integrations",
    group: "navigation",
    kind: "navigate",
    target: "/settings/integrations",
    requires: ["settings:manage_integrations"],
  },
  {
    id: "nav-subscriptions",
    label: "Subscriptions",
    group: "navigation",
    kind: "navigate",
    target: "/admin/subscriptions",
    requires: ["subscriptions:view"],
  },

  // ── Leads (10) ────────────────────────────────────────────────────────────
  {
    id: "lead-create",
    label: "Create new lead",
    group: "leads",
    kind: "action",
    action: "open-new-lead-dialog",
    requires: ["leads:create"],
    hint: "C L",
  },
  {
    id: "lead-open-by-name",
    label: "Open lead by name…",
    group: "leads",
    kind: "lookup-prefix",
    prefix: "Lead:",
    action: "open-lead-by-name",
    requires: ["leads:view"],
  },
  // D-617 — the 5 lead-state shortcuts now navigate to /dashboard/leads
  // with a canned filter applied (see src/lib/leads/canned-views.ts).
  {
    id: "lead-show-hot",
    label: "Show hot leads",
    group: "leads",
    kind: "navigate",
    target: "/dashboard/leads?canned=hot-leads",
    requires: ["leads:view"],
  },
  {
    id: "lead-show-new",
    label: "Show new leads",
    group: "leads",
    kind: "navigate",
    target: "/dashboard/leads?canned=new-leads",
    requires: ["leads:view"],
  },
  {
    id: "lead-show-contacted",
    label: "Show contacted leads",
    group: "leads",
    kind: "navigate",
    target: "/dashboard/leads?canned=contacted-leads",
    requires: ["leads:view"],
  },
  {
    id: "lead-show-qualified",
    label: "Show qualified leads",
    group: "leads",
    kind: "navigate",
    target: "/dashboard/leads?canned=qualified-leads",
    requires: ["leads:view"],
  },
  {
    id: "lead-show-terminal",
    label: "Show terminal leads (lost / on hold / junk)",
    group: "leads",
    kind: "navigate",
    target: "/dashboard/leads?canned=terminal-leads",
    requires: ["leads:view"],
  },
  // D-617 — source-specific filters, viable now that D-604 records
  // `data.source` provenance on every ingested lead.
  {
    id: "lead-source-magicbricks",
    label: "Show leads from magicbricks",
    group: "leads",
    kind: "navigate",
    target: "/dashboard/leads?canned=leads-magicbricks",
    requires: ["leads:view"],
  },
  {
    id: "lead-source-99acres",
    label: "Show leads from 99acres",
    group: "leads",
    kind: "navigate",
    target: "/dashboard/leads?canned=leads-99acres",
    requires: ["leads:view"],
  },
  {
    id: "lead-source-walkin",
    label: "Show walk-in leads",
    group: "leads",
    kind: "navigate",
    target: "/dashboard/leads?canned=leads-walkin",
    requires: ["leads:view"],
  },

  // ── Operations (5) ────────────────────────────────────────────────────────
  {
    id: "ops-site-visits-today",
    label: "Show today's site visits",
    group: "operations",
    kind: "navigate",
    target: "/dashboard/site-visits?bucket=today",
    requires: ["site_visits:view"],
  },
  // D-617 — the PRD's "lookup-prefix" assumption was wrong (these were
  // placeholders); they now navigate to the real D-410 list pages.
  {
    id: "ops-open-deal",
    label: "Browse deals",
    group: "operations",
    kind: "navigate",
    target: "/dashboard/deals",
    requires: ["deals:view"],
  },
  {
    id: "ops-open-contact",
    label: "Browse contacts",
    group: "operations",
    kind: "navigate",
    target: "/dashboard/contacts",
    requires: ["contacts:view"],
  },
  {
    id: "ops-view-audit",
    label: "View workspace audit",
    group: "operations",
    kind: "navigate",
    target: "/admin/audit",
    requires: ["audit:view"],
  },
  {
    id: "ops-platform-analytics",
    label: "Platform analytics",
    group: "operations",
    kind: "navigate",
    target: "/platform/analytics",
    requires: ["platform_analytics:view"],
  },

  // ── Account (3) ───────────────────────────────────────────────────────────
  {
    id: "account-toggle-theme",
    label: "Toggle theme",
    group: "account",
    kind: "action",
    action: "toggle-theme",
    hint: "T",
  },
  {
    id: "account-sign-out",
    label: "Sign out",
    group: "account",
    kind: "action",
    action: "sign-out",
  },
  {
    id: "account-billing",
    label: "View billing",
    group: "account",
    kind: "navigate",
    target: "/admin/subscriptions",
    requires: ["billing:view"],
  },

  // ── Help (2) ──────────────────────────────────────────────────────────────
  {
    id: "help-about",
    label: "About Builtrix",
    group: "help",
    kind: "navigate",
    target: "/dashboard",
  },
  {
    id: "help-feedback",
    label: "Send feedback",
    group: "help",
    kind: "navigate",
    target: "/dashboard/settings/feedback",
  },
] as const satisfies readonly Command[];

export type CommandId = (typeof COMMANDS)[number]["id"];
