"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentTier } from "@/lib/ai/types";
import { agentsAction } from "./actions";

const NONE = "none" as const;
const TIER_OPTIONS: AgentTier[] = ["T0", "T1", "T2", "T3", "T4"];

export function TierCell({
  agent_type,
  current,
  global_max,
  disabled,
}: {
  agent_type: string;
  current: AgentTier | null;
  global_max: AgentTier;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const value = current ?? NONE;

  const allowed = TIER_OPTIONS.filter(
    (t) =>
      ["T0", "T1", "T2", "T3", "T4"].indexOf(t) <=
      ["T0", "T1", "T2", "T3", "T4"].indexOf(global_max),
  );

  const onChange = (next: string | null) => {
    if (!next) return;
    if (next === value) return;
    const fd = new FormData();
    fd.append("intent", "set_tier");
    fd.append("agent_type", agent_type);
    fd.append("max_tier_override", next);
    startTransition(async () => {
      const result = await agentsAction(fd);
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.warn("[agents] set_tier failed", result);
        return;
      }
      router.refresh();
    });
  };

  if (disabled) {
    return <span className="text-xs text-neutral-500">{value}</span>;
  }

  return (
    <Select value={value} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        data-testid={`tier-select-${agent_type}`}
        className="h-7 w-[100px] text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Default ({global_max})</SelectItem>
        {allowed.map((t) => (
          <SelectItem key={t} value={t}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
