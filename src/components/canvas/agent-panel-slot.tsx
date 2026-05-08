import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Agent activity slot. Empty-state default; D-009 (Lead Enrichment Agent)
 * replaces by passing `children`. Contract locked into baseline 112.
 */
export function AgentPanelSlot({ children }: { children?: ReactNode }) {
  return (
    <Card data-testid="agent-panel" data-empty={!children}>
      <CardHeader>
        <CardTitle className="text-base">Agent activity</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-neutral-600">
        {children ?? (
          <>
            <p>No agent activity yet.</p>
            <p className="mt-1">
              The Lead Enrichment Agent arrives in{" "}
              <Link href="/admin/agents" className="underline">
                D-009
              </Link>
              .
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
