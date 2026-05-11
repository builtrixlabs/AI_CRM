"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import {
  createProject,
  createTower,
  createUnit,
  transitionUnitState,
} from "@/lib/inventory";
import {
  projectCreateSchema,
  towerCreateSchema,
  unitCreateSchema,
} from "@/lib/inventory/types";
import {
  INVENTORY_STATES,
  type UnitState,
} from "@/lib/inventory/transitions";
import { TRANSITION_PERM_MAP } from "@/components/inventory/unit-state-action-menu";

export type TransitionErrorCode =
  | "not_found"
  | "cross_tenant"
  | "unknown_state"
  | "illegal_transition"
  | "backward_no_override"
  | "rpc_error";

export type InventoryActionResult =
  | { ok: true; data?: Record<string, unknown> }
  | {
      ok: false;
      error: "permission" | "validation" | "transition" | "unknown";
      message?: string;
      transition_error?: TransitionErrorCode;
    };

const stringOrUndef = (raw: FormDataEntryValue | null): string | undefined => {
  if (raw == null || typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t === "" ? undefined : t;
};

const numberOrUndef = (raw: FormDataEntryValue | null): number | undefined => {
  const s = stringOrUndef(raw);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export async function inventoryAction(
  formData: FormData,
): Promise<InventoryActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (!user.org_id) {
    return { ok: false, error: "validation", message: "User has no org" };
  }
  const perms = resolveForUser(user);
  const intent = stringOrUndef(formData.get("intent"));
  const workspace_id =
    stringOrUndef(formData.get("workspace_id")) ?? user.workspace_ids[0];
  if (!workspace_id) {
    return {
      ok: false,
      error: "validation",
      message: "User has no workspace",
    };
  }
  const actor_role = user.profile.base_role;

  try {
    switch (intent) {
      case "create_project": {
        if (!perms.has("properties:create")) {
          return { ok: false, error: "permission" };
        }
        const parsed = projectCreateSchema.safeParse({
          name: stringOrUndef(formData.get("name")),
          city: stringOrUndef(formData.get("city")),
          address: stringOrUndef(formData.get("address")) ?? null,
          rera_number: stringOrUndef(formData.get("rera_number")) ?? null,
          possession_date_committed:
            stringOrUndef(formData.get("possession_date_committed")) ?? null,
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            message: parsed.error.message,
          };
        }
        const r = await createProject({
          organization_id: user.org_id,
          workspace_id,
          actor_id: user.user.id,
          payload: parsed.data,
        });
        revalidatePath("/admin/inventory");
        return { ok: true, data: { id: r.id } };
      }

      case "create_tower": {
        if (!perms.has("properties:create")) {
          return { ok: false, error: "permission" };
        }
        const project_id = stringOrUndef(formData.get("project_id"));
        if (!project_id) {
          return {
            ok: false,
            error: "validation",
            message: "project_id required",
          };
        }
        const parsed = towerCreateSchema.safeParse({
          project_id,
          name: stringOrUndef(formData.get("name")),
          total_floors: numberOrUndef(formData.get("total_floors")) ?? null,
          units_per_floor:
            numberOrUndef(formData.get("units_per_floor")) ?? null,
          notes: stringOrUndef(formData.get("notes")) ?? null,
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            message: parsed.error.message,
          };
        }
        const r = await createTower({
          organization_id: user.org_id,
          workspace_id,
          actor_id: user.user.id,
          payload: parsed.data,
        });
        revalidatePath(`/admin/inventory/${project_id}`);
        return { ok: true, data: { id: r.id } };
      }

      case "create_unit": {
        if (!perms.has("units:create")) {
          return { ok: false, error: "permission" };
        }
        const project_id = stringOrUndef(formData.get("project_id"));
        if (!project_id) {
          return {
            ok: false,
            error: "validation",
            message: "project_id required",
          };
        }
        const parsed = unitCreateSchema.safeParse({
          project_id,
          tower_id: stringOrUndef(formData.get("tower_id")) ?? null,
          unit_no: stringOrUndef(formData.get("unit_no")),
          floor: numberOrUndef(formData.get("floor")) ?? null,
          unit_type: stringOrUndef(formData.get("unit_type")),
          carpet_area_sqft:
            numberOrUndef(formData.get("carpet_area_sqft")) ?? null,
          base_price: numberOrUndef(formData.get("base_price")) ?? null,
          price_per_sqft:
            numberOrUndef(formData.get("price_per_sqft")) ?? null,
          facing: stringOrUndef(formData.get("facing")) ?? null,
          rera_unit_id: stringOrUndef(formData.get("rera_unit_id")) ?? null,
        });
        if (!parsed.success) {
          return {
            ok: false,
            error: "validation",
            message: parsed.error.message,
          };
        }
        const r = await createUnit({
          organization_id: user.org_id,
          workspace_id,
          actor_id: user.user.id,
          payload: parsed.data,
        });
        const tower_id = parsed.data.tower_id;
        if (tower_id) {
          revalidatePath(`/admin/inventory/${project_id}/towers/${tower_id}`);
        }
        revalidatePath(`/admin/inventory/${project_id}`);
        return { ok: true, data: { id: r.id } };
      }

      case "transition": {
        const unit_id = stringOrUndef(formData.get("unit_id"));
        const to_state_raw = stringOrUndef(formData.get("to_state"));
        const has_override = stringOrUndef(formData.get("has_override")) === "1";
        if (!unit_id || !to_state_raw) {
          return {
            ok: false,
            error: "validation",
            message: "unit_id + to_state required",
          };
        }
        const parsedState = z.enum(INVENTORY_STATES).safeParse(to_state_raw);
        if (!parsedState.success) {
          return {
            ok: false,
            error: "validation",
            message: "invalid to_state",
          };
        }
        const to_state: UnitState = parsedState.data;

        // Permission gate (UI mirror of RPC's graph check).
        if (has_override) {
          if (!perms.has("catalog:admin_override")) {
            return { ok: false, error: "permission" };
          }
        } else {
          const requiredPerm = TRANSITION_PERM_MAP[to_state];
          if (requiredPerm && !perms.has(requiredPerm)) {
            return { ok: false, error: "permission" };
          }
        }

        const result = await transitionUnitState({
          organization_id: user.org_id,
          unit_id,
          to_state,
          actor_id: user.user.id,
          actor_role,
          reason: stringOrUndef(formData.get("reason")) ?? null,
          has_override,
        });
        if (!result.ok) {
          return {
            ok: false,
            error: "transition",
            message: result.message ?? result.error,
            transition_error: result.error,
          };
        }
        revalidatePath("/admin/inventory");
        return { ok: true, data: { new_state: result.new_state } };
      }

      default:
        return {
          ok: false,
          error: "validation",
          message: `Unknown intent: ${intent ?? "(missing)"}`,
        };
    }
  } catch (err) {
    return {
      ok: false,
      error: "unknown",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Convenience formAction wrapper for forms that don't care about the result. */
export async function inventoryFormAction(formData: FormData): Promise<void> {
  await inventoryAction(formData);
}
