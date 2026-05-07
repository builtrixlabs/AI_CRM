"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { NewLeadDialog } from "./new-lead-dialog";

type NewLeadDialogContextValue = {
  isOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
};

const NewLeadDialogContext = createContext<NewLeadDialogContextValue | null>(null);

/**
 * Lifts the NewLeadDialog open-state into a Context so any descendant
 * (the dashboard page button, the Cmd+K palette, future toolbars) can
 * call `openDialog()` imperatively. Mounts the dialog ONCE at layout
 * level. The dialog itself is controlled (`open` prop) and never owns
 * its open state when wrapped here.
 */
export function NewLeadDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openDialog = useCallback(() => setIsOpen(true), []);
  const closeDialog = useCallback(() => setIsOpen(false), []);
  return (
    <NewLeadDialogContext.Provider value={{ isOpen, openDialog, closeDialog }}>
      {children}
      <NewLeadDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        hideTrigger
      />
    </NewLeadDialogContext.Provider>
  );
}

/**
 * Hook for descendants of `NewLeadDialogProvider`. Throws if used
 * outside the provider — call sites should always be wrapped.
 */
export function useNewLeadDialog(): NewLeadDialogContextValue {
  const ctx = useContext(NewLeadDialogContext);
  if (!ctx) {
    throw new Error(
      "useNewLeadDialog must be used inside <NewLeadDialogProvider>",
    );
  }
  return ctx;
}
