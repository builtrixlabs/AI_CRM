"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function InviteUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [baseRole, setBaseRole] = useState<AssignableBaseRole | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const reset = () => {
    setEmail("");
    setDisplayName("");
    setBaseRole("");
    setErrors({});
  };

  const submit = () => {
    setErrors({});
    if (!baseRole) {
      setErrors({ base_role: "Pick a role" });
      return;
    }
    const fd = new FormData();
    fd.append("intent", "invite");
    fd.append("email", email);
    fd.append("display_name", displayName);
    fd.append("base_role", baseRole);
    startTransition(async () => {
      const result = await usersAction(fd);
      if (!result.ok) {
        if (result.error === "validation" && result.fieldErrors) {
          setErrors(result.fieldErrors);
        } else {
          setErrors({ _form: result.message ?? "Failed to invite user." });
        }
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        type="button"
        data-testid="invite-user-trigger"
        onClick={() => setOpen(true)}
      >
        + Invite user
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          setOpen(v);
        }}
      >
        <DialogContent className="max-w-md" data-testid="invite-user-dialog">
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@yourorg.com"
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-display-name">Display name</Label>
              <Input
                id="invite-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={120}
                placeholder="Asha Patel"
              />
              {errors.display_name && (
                <p className="text-xs text-destructive">{errors.display_name}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={baseRole}
                onValueChange={(v) => setBaseRole(v as AssignableBaseRole)}
              >
                <SelectTrigger id="invite-role" data-testid="invite-role-select">
                  <SelectValue placeholder="Select a role…" />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_BASE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.base_role && (
                <p className="text-xs text-destructive">{errors.base_role}</p>
              )}
            </div>

            <p className="text-xs text-neutral-500">
              The user will be created with email confirmation. Share initial
              credentials with them offline; magic-link invitations land in V2.
            </p>

            {errors._form && (
              <p className="text-sm text-destructive" role="alert">
                {errors._form}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              data-testid="invite-user-submit"
              onClick={submit}
              disabled={pending}
            >
              {pending ? "Inviting…" : "Invite user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
