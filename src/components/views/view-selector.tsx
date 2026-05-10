"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CustomViewRow } from "@/lib/views/types";

const SYSTEM_DEFAULT_VALUE = "__system_default__";

export function ViewSelector(props: {
  views: CustomViewRow[];
  currentSlug: string | null;
  basePath: string;
  systemDefaultLabel?: string;
}) {
  const router = useRouter();
  const search = useSearchParams();

  const orgViews = props.views.filter((v) => v.scope === "org");
  const userViews = props.views.filter((v) => v.scope === "user");
  const currentValue = props.currentSlug ?? SYSTEM_DEFAULT_VALUE;

  const onChange = (next: string | null) => {
    const params = new URLSearchParams(search?.toString() ?? "");
    if (next == null || next === SYSTEM_DEFAULT_VALUE) {
      params.delete("view");
    } else {
      params.set("view", next);
    }
    // Clear page; switching view resets pagination.
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${props.basePath}?${qs}` : props.basePath);
  };

  return (
    <Select value={currentValue} onValueChange={onChange}>
      <SelectTrigger data-slot="view-selector" className="min-w-[14rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SYSTEM_DEFAULT_VALUE}>
          {props.systemDefaultLabel ?? "All (system default)"}
        </SelectItem>
        {orgViews.length > 0 && (
          <div className="px-2 pt-2 pb-1 text-xs uppercase tracking-wide text-neutral-500">
            Shared
          </div>
        )}
        {orgViews.map((v) => (
          <SelectItem key={v.id} value={v.slug}>
            {v.name}
          </SelectItem>
        ))}
        {userViews.length > 0 && (
          <div className="px-2 pt-2 pb-1 text-xs uppercase tracking-wide text-neutral-500">
            Private
          </div>
        )}
        {userViews.map((v) => (
          <SelectItem key={v.id} value={v.slug}>
            {v.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
