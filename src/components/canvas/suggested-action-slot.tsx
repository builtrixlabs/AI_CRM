import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Suggested-next-action slot. Empty-state default; D-011 (DOE engine)
 * replaces by passing `children`. Contract locked into baseline 112.
 */
export function SuggestedActionSlot({ children }: { children?: ReactNode }) {
  return (
    <Card data-testid="suggested-action" data-empty={!children}>
      <CardHeader>
        <CardTitle className="text-base">Suggested next action</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-neutral-600">
        {children ?? (
          <>
            <p>No suggestions yet.</p>
            <p className="mt-1">
              The DOE engine arrives in{" "}
              <Link href="/admin/directives" className="underline">
                D-011
              </Link>
              .
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
