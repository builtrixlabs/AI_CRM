import { describe, expect, it } from "vitest";
import {
  TRANSITION_PERM_MAP,
  allowedTransitionsForCaller,
} from "@/components/inventory/unit-state-action-menu";
import type { UnitState } from "@/lib/inventory/transitions";
import type { Permission } from "@/lib/auth/rbac";

function perms(...p: Permission[]): Set<Permission> {
  return new Set(p);
}

describe("TRANSITION_PERM_MAP", () => {
  it("maps each non-available state to its inventory:* perm", () => {
    expect(TRANSITION_PERM_MAP.held).toBe("inventory:hold");
    expect(TRANSITION_PERM_MAP.blocked).toBe("inventory:block");
    expect(TRANSITION_PERM_MAP.booked).toBe("inventory:book");
    expect(TRANSITION_PERM_MAP.sold).toBe("inventory:sell");
    expect(TRANSITION_PERM_MAP.registered).toBe("inventory:register");
    expect(TRANSITION_PERM_MAP.possessed).toBe("inventory:possess");
    expect(TRANSITION_PERM_MAP.available).toBe("properties:release");
  });
});

describe("allowedTransitionsForCaller — no override", () => {
  it("sales_rep (hold only): from available → only [held]", () => {
    const out = allowedTransitionsForCaller(
      "available",
      perms("inventory:hold"),
      false,
    );
    expect(out).toEqual(["held"]);
  });

  it("sales_rep cannot book from available", () => {
    const out = allowedTransitionsForCaller(
      "available",
      perms("inventory:hold"),
      false,
    );
    expect(out).not.toContain("booked");
  });

  it("manager (+block): from held → can block or release, can't book", () => {
    const p = perms("inventory:hold", "inventory:block", "properties:release");
    const out = allowedTransitionsForCaller("held", p, false);
    expect(new Set(out)).toEqual(new Set(["blocked", "available"]));
  });

  it("workspace_admin: from booked → can sell only (no register; booked has no edge to register)", () => {
    const p = perms(
      "inventory:hold",
      "inventory:block",
      "inventory:book",
      "inventory:sell",
      "inventory:register",
      "inventory:possess",
      "properties:release",
    );
    const out = allowedTransitionsForCaller("booked", p, false);
    expect(out).toEqual(["sold"]);
  });

  it("possessed has no forward actions", () => {
    const p = perms(
      "inventory:hold",
      "inventory:block",
      "inventory:book",
      "inventory:sell",
      "inventory:register",
      "inventory:possess",
      "properties:release",
    );
    const out = allowedTransitionsForCaller("possessed", p, false);
    expect(out).toEqual([]);
  });

  it("empty perms set → no actions", () => {
    const out = allowedTransitionsForCaller("available", perms(), false);
    expect(out).toEqual([]);
  });
});

describe("allowedTransitionsForCaller — with override", () => {
  it("override surfaces every other state (backward + non-adjacent forward)", () => {
    const out = allowedTransitionsForCaller(
      "booked",
      perms("catalog:admin_override"),
      true,
    );
    // override = true exposes everything except current state.
    const expected: UnitState[] = [
      "available",
      "held",
      "blocked",
      "sold",
      "registered",
      "possessed",
    ];
    for (const s of expected) expect(out).toContain(s);
    expect(out).not.toContain("booked");
  });
});
