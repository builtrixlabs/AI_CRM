"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const BUCKET_OPTIONS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "mine", label: "Mine" },
  { value: "resolved", label: "Resolved (last 30d)" },
];

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All reasons" },
  { value: "lost", label: "Lost" },
  { value: "on_hold", label: "On hold" },
  { value: "stale_contacted", label: "Stale (contacted)" },
  { value: "stale_qualified", label: "Stale (qualified)" },
];

export function RecoveryFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const currentBucket = sp.get("bucket") ?? "open";
  const currentReason = sp.get("reason") ?? "";

  return (
    <div
      className="flex flex-wrap items-end gap-3"
      data-testid="recovery-filter-bar"
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Bucket
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={currentBucket}
          onChange={(e) => setParam("bucket", e.target.value)}
          data-testid="recovery-filter-bucket"
        >
          {BUCKET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Reason
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={currentReason}
          onChange={(e) => setParam("reason", e.target.value)}
          data-testid="recovery-filter-reason"
        >
          {REASON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
