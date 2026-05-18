import type { Permission } from "@/lib/auth/rbac";

export const COMMAND_GROUPS = [
  "navigation",
  "leads",
  "operations",
  "account",
  "help",
] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

// D-617 removed the `placeholder` kind — every Cmd+K command now resolves
// to a real navigate / action / lookup-prefix destination.
export const COMMAND_KINDS = [
  "navigate",
  "action",
  "lookup-prefix",
] as const;
export type CommandKind = (typeof COMMAND_KINDS)[number];

/**
 * One catalog entry. The set of all entries is the bounded V0 Cmd+K
 * catalog (Constitution X — NL-Compile-Then-Apply: D-008 ships only
 * the compiled-artifact list; free-form NL is V1).
 */
export type Command = {
  id: string;
  label: string;
  group: CommandGroup;
  kind: CommandKind;
  /** URL for `navigate`. */
  target?: string;
  /** Dispatch key for `action`. */
  action?: ActionKey;
  /** Sub-mode label for `lookup-prefix` (e.g. "Lead:"). */
  prefix?: string;
  /** Right-aligned hint text in the palette. */
  hint?: string;
  /** All permissions in this list must be present for the user to see the command. */
  requires?: readonly Permission[];
};

export const ACTION_KEYS = [
  "open-new-lead-dialog",
  "toggle-theme",
  "sign-out",
  "open-lead-by-name",
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];
