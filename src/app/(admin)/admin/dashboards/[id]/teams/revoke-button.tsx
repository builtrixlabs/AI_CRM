"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revokeFromTeamAction } from "./actions";

export function RevokeButton({
  dashboardId,
  assignmentId,
  teamName,
}: {
  dashboardId: string;
  assignmentId: string;
  teamName: string;
}) {
  const [pending, start] = useTransition();
  const onClick = () => {
    if (!confirm(`Revoke publication to ${teamName}?`)) return;
    start(async () => {
      const r = await revokeFromTeamAction(dashboardId, assignmentId);
      if (!r.ok) alert(`Could not revoke: ${r.reason}`);
    });
  };
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onClick}
      disabled={pending}
      data-testid={`revoke-${assignmentId}`}
    >
      {pending ? "Revoking…" : "Revoke"}
    </Button>
  );
}
