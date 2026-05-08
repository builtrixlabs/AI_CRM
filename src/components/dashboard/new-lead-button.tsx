"use client";
import { Button } from "@/components/ui/button";
import { useNewLeadDialog } from "./new-lead-dialog-context";

/**
 * Trigger button for the layout-mounted NewLeadDialog. Replaces the
 * old inline `<NewLeadDialog />` mount on /dashboard so Cmd+K and
 * this button share open state via the Provider.
 */
export function NewLeadButton() {
  const { openDialog } = useNewLeadDialog();
  return (
    <Button
      type="button"
      data-testid="new-lead-trigger"
      onClick={openDialog}
    >
      + New lead
    </Button>
  );
}
