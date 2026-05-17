"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QuickActionModal } from "./quick-action-modal";

/**
 * v6.2.1 — top-right trigger button that opens the Quick Action modal.
 * Rendered only when the viewing user has leads:edit (page-level gate).
 */
export type QuickActionButtonProps = {
  leadId: string;
  currentState: string;
};

export function QuickActionButton({
  leadId,
  currentState,
}: QuickActionButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="quick-action-button"
      >
        Quick action
      </Button>
      <QuickActionModal
        leadId={leadId}
        currentState={currentState}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
