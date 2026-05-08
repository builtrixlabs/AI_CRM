import type { Command } from "./types";

/**
 * Allowed slugs for `/dashboard/placeholder/[slug]`. Placeholder commands
 * navigate to one of these; the placeholder route validates the slug.
 */
export const PLACEHOLDER_SLUGS = [
  "hot-leads",
  "new-leads",
  "contacted-leads",
  "qualified-leads",
  "terminal-leads",
  "leads-magicbricks",
  "leads-99acres",
  "leads-walkin",
  "site-visits-today",
  "open-deal",
  "open-contact",
  "send-feedback",
] as const;

export type PlaceholderSlug = (typeof PLACEHOLDER_SLUGS)[number];

/**
 * V0 Cmd+K catalog — 30 commands. Locked literal per directive 008.
 * Adding/removing requires a Plan-Mode-reviewed amendment.
 */
export const COMMANDS = [
  // ── Navigation (9) ────────────────────────────────────────────────────────
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
  {
    id: "lead-show-hot",
    label: "Show hot leads",
    group: "leads",
    kind: "placeholder",
    target: "/dashboard/placeholder/hot-leads",
    requires: ["leads:view"],
  },
  {
    id: "lead-show-new",
    label: "Show new leads",
    group: "leads",
    kind: "placeholder",
    target: "/dashboard/placeholder/new-leads",
    requires: ["leads:view"],
  },
  {
    id: "lead-show-contacted",
    label: "Show contacted leads",
    group: "leads",
    kind: "placeholder",
    target: "/dashboard/placeholder/contacted-leads",
    requires: ["leads:view"],
  },
  {
    id: "lead-show-qualified",
    label: "Show qualified leads",
    group: "leads",
    kind: "placeholder",
    target: "/dashboard/placeholder/qualified-leads",
    requires: ["leads:view"],
  },
  {
    id: "lead-show-terminal",
    label: "Show terminal leads (lost / on hold / junk)",
    group: "leads",
    kind: "placeholder",
    target: "/dashboard/placeholder/terminal-leads",
    requires: ["leads:view"],
  },
  {
    id: "lead-source-magicbricks",
    label: "Show leads from magicbricks",
    group: "leads",
    kind: "placeholder",
    target: "/dashboard/placeholder/leads-magicbricks",
    requires: ["leads:view"],
  },
  {
    id: "lead-source-99acres",
    label: "Show leads from 99acres",
    group: "leads",
    kind: "placeholder",
    target: "/dashboard/placeholder/leads-99acres",
    requires: ["leads:view"],
  },
  {
    id: "lead-source-walkin",
    label: "Show walk-in leads",
    group: "leads",
    kind: "placeholder",
    target: "/dashboard/placeholder/leads-walkin",
    requires: ["leads:view"],
  },

  // ── Operations (5) ────────────────────────────────────────────────────────
  {
    id: "ops-site-visits-today",
    label: "Show today's site visits",
    group: "operations",
    kind: "placeholder",
    target: "/dashboard/placeholder/site-visits-today",
    requires: ["site_visits:view"],
  },
  {
    id: "ops-open-deal",
    label: "Open deal by name…",
    group: "operations",
    kind: "placeholder",
    target: "/dashboard/placeholder/open-deal",
    requires: ["deals:view"],
  },
  {
    id: "ops-open-contact",
    label: "Open contact by name…",
    group: "operations",
    kind: "placeholder",
    target: "/dashboard/placeholder/open-contact",
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

  // ── Account (4) ───────────────────────────────────────────────────────────
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
    id: "account-keyboard-shortcuts",
    label: "Help · Keyboard shortcuts",
    group: "account",
    kind: "navigate",
    target: "/dashboard/placeholder/send-feedback",
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
    kind: "placeholder",
    target: "/dashboard/placeholder/send-feedback",
  },
] as const satisfies readonly Command[];

export type CommandId = (typeof COMMANDS)[number]["id"];
