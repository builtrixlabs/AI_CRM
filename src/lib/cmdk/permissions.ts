import type { Permission } from "@/lib/auth/rbac";
import type { Command } from "./types";

/**
 * Filter the catalog to commands the user can see.
 *
 * A command is visible iff every entry in its `requires[]` is in the
 * user's effective permission set. Commands with no `requires` are
 * always visible (e.g. Toggle theme, Sign out).
 *
 * Hide-don't-disable per Constitution III precedent (D-001 RBAC).
 */
export function visibleCommands(
  catalog: readonly Command[],
  perms: ReadonlySet<Permission>,
): readonly Command[] {
  return catalog.filter((cmd) => {
    if (!cmd.requires || cmd.requires.length === 0) return true;
    for (const required of cmd.requires) {
      if (!perms.has(required)) return false;
    }
    return true;
  });
}
