"use client";
import { Button } from "@/components/ui/button";

type Props = {
  editing: boolean;
  onToggle: () => void;
};

export function EditModeButton({ editing, onToggle }: Props) {
  return (
    <Button
      type="button"
      size="sm"
      variant={editing ? "secondary" : "outline"}
      data-testid="edit-mode-toggle"
      data-editing={editing}
      onClick={onToggle}
    >
      {editing ? "Cancel" : "Edit"}
    </Button>
  );
}
