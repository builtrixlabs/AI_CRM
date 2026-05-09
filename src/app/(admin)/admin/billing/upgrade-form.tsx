"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLAN_TIERS, PLAN_TIER_ORDER } from "@/lib/platform/plan-tiers";
import { requestUpgradeAction } from "./actions";

export function UpgradeForm({ current_tier }: { current_tier: string }) {
  const router = useRouter();
  const [tier, setTier] = useState<string>(
    PLAN_TIER_ORDER.find((t) => t !== current_tier) ?? "professional"
  );
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const submit = () =>
    start(async () => {
      setMsg(null);
      const r = await requestUpgradeAction(tier, reason);
      if (r.ok) {
        setMsg({
          kind: "ok",
          text: "Request filed. The Builtrix team will reach out shortly.",
        });
        setReason("");
        router.refresh();
      } else {
        setMsg({ kind: "err", text: r.message ?? r.error });
      }
    });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="target-tier">Target tier</Label>
        <select
          id="target-tier"
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className="w-full rounded-md border bg-white px-3 py-2 text-sm"
        >
          {PLAN_TIER_ORDER.map((t) => (
            <option key={t} value={t}>
              {PLAN_TIERS[t].display_name}
              {t === current_tier ? " (current)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="upgrade-reason">Reason</Label>
        <Textarea
          id="upgrade-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What changed in your usage or needs?"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button
          onClick={submit}
          disabled={pending || tier === current_tier || reason.trim().length < 3}
        >
          {pending ? "Filing…" : "Request upgrade"}
        </Button>
        {msg && (
          <span
            className={`text-xs ${
              msg.kind === "ok" ? "text-emerald-700" : "text-red-700"
            }`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
