"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setFlagAction } from "./actions";
import type { FlagRow as Row } from "@/lib/platform/flags";

function detectType(value: unknown): "boolean" | "number" | "string" {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

export function FlagEditor({ row }: { row: Row }) {
  const router = useRouter();
  const type = detectType(row.value);
  const [draft, setDraft] = useState<string>(String(row.value));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const apply = (override?: string) =>
    start(async () => {
      setMsg(null);
      const valueToSend = override ?? draft;
      const r = await setFlagAction(row.key, valueToSend, type);
      if (r.ok) {
        setMsg({ kind: "ok", text: "Saved" });
        if (type === "boolean") setDraft(valueToSend);
        router.refresh();
      } else {
        setMsg({ kind: "err", text: r.message ?? r.error });
      }
    });

  if (type === "boolean") {
    const isOn = draft === "true";
    return (
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant={isOn ? "default" : "outline"}
          onClick={() => apply("true")}
          disabled={pending || isOn}
        >
          On
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!isOn ? "default" : "outline"}
          onClick={() => apply("false")}
          disabled={pending || !isOn}
        >
          Off
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
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type={type === "number" ? "number" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="max-w-xs"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => apply()}
        disabled={pending || draft === String(row.value)}
      >
        {pending ? "Saving…" : "Save"}
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
  );
}
