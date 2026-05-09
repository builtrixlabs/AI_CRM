"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deleteWebhookAction,
  testWebhookAction,
  toggleWebhookAction,
} from "./actions";
import type { WebhookEndpoint } from "@/lib/admin/webhooks";

export function WebhookRowActions({ row }: { row: WebhookEndpoint }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2 justify-end">
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          start(async () => {
            await testWebhookAction(row.id);
            router.refresh();
          })
        }
        disabled={pending}
      >
        Send test
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          start(async () => {
            await toggleWebhookAction(row.id, !row.enabled);
            router.refresh();
          })
        }
        disabled={pending}
      >
        {row.enabled ? "Disable" : "Enable"}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() =>
          start(async () => {
            const ok = window.confirm(`Delete webhook "${row.name}"?`);
            if (!ok) return;
            await deleteWebhookAction(row.id);
            router.refresh();
          })
        }
        disabled={pending}
      >
        Delete
      </Button>
    </div>
  );
}

export function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge
      variant={enabled ? "default" : "outline"}
      className={
        enabled
          ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-emerald-200"
          : "text-neutral-600"
      }
    >
      {enabled ? "Enabled" : "Disabled"}
    </Badge>
  );
}
