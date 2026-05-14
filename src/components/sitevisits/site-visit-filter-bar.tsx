"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
];

const BUCKET_OPTIONS: { value: string; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "today", label: "Today" },
  { value: "all", label: "All time" },
];

export function SiteVisitFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Window and specific-day are mutually exclusive selectors.
    if (key === "bucket") next.delete("date");
    if (key === "date" && value) next.delete("bucket");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasDate = Boolean(sp.get("date"));
  const currentBucket = hasDate ? "" : (sp.get("bucket") ?? "upcoming");
  const currentStatus = sp.get("status") ?? "";
  const currentDate = sp.get("date") ?? "";

  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="sv-filter-bar">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Window
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={currentBucket}
          onChange={(e) => setParam("bucket", e.target.value)}
          data-testid="sv-filter-bucket"
        >
          {hasDate && <option value="">(specific day)</option>}
          {BUCKET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Status
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={currentStatus}
          onChange={(e) => setParam("status", e.target.value)}
          data-testid="sv-filter-status"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Specific day
        <input
          type="date"
          className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          value={currentDate}
          onChange={(e) => setParam("date", e.target.value)}
          data-testid="sv-filter-date"
        />
      </label>
    </div>
  );
}
