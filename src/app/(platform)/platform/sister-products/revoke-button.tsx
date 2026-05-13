"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revokeTokenAction } from "./actions";

export function RevokeButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (
      !window.confirm(
        "Revoke this token? Sister products using it will start receiving 401s immediately.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await revokeTokenAction(id);
      if (!res.ok) {
        window.alert(`Revoke failed: ${res.error}`);
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={handleClick}
      disabled={pending}
      aria-label="Revoke token"
      data-testid={`sp-revoke-${id}`}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
