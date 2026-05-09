"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSIGNABLE_BASE_ROLES, type AssignableBaseRole } from "@/lib/users/types";
import { usersAction } from "./actions";

const ROLE_LABEL: Record<AssignableBaseRole, string> = {
  org_owner: "Org owner",
  org_admin: "Org admin",
  workspace_admin: "Workspace admin",
  manager: "Manager",
  sales_rep: "Sales rep",
  read_only: "Read-only",
  channel_partner: "Channel partner",
};

export function RoleCell({
  user_id,
  current,
  disabled,
}: {
  user_id: string;
  current: AssignableBaseRole | "super_admin" | "service_account";
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (current === "super_admin" || current === "service_account" || disabled) {
    return <span className="text-xs text-neutral-500">{current}</span>;
  }

  const onChange = (next: string | null) => {
    if (!next || next === current) return;
    const fd = new FormData();
    fd.append("intent", "change_role");
    fd.append("user_id", user_id);
    fd.append("base_role", next);
    startTransition(async () => {
      const result = await usersAction(fd);
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.warn("[users] change_role failed", result);
        return;
      }
      router.refresh();
    });
  };

  return (
    <Select value={current} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        data-testid={`role-select-${user_id}`}
        className="h-7 w-[140px] text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ASSIGNABLE_BASE_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
