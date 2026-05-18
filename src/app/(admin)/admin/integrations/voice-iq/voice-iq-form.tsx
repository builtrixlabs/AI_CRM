"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  rotateVoiceIqSecretAction,
  pingVoiceIqInboxAction,
} from "./actions";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard may be blocked in some embeds — ignore */
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

export function RotateSecretButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="default"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await rotateVoiceIqSecretAction();
            if (r.ok) {
              setMsg(`Rotated · last4 ${r.last4}`);
            } else if (r.error === "rate_limit") {
              setMsg(r.message ?? "rate-limited");
            } else if (r.error === "permission") {
              setMsg("permission denied");
            } else {
              setMsg(r.message ?? "failed");
            }
          })
        }
      >
        {pending ? "Rotating…" : "Rotate secret"}
      </Button>
      {msg && (
        <span className="text-xs text-neutral-600" role="status">
          {msg}
        </span>
      )}
    </div>
  );
}

export function PingButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<
    | null
    | { kind: "ok"; status: number; latency_ms: number; preview: string }
    | { kind: "err"; message: string }
  >(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="default"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(null);
            const r = await pingVoiceIqInboxAction();
            if (r.ok) {
              setResult({
                kind: "ok",
                status: r.status,
                latency_ms: r.latency_ms,
                preview: r.body_preview,
              });
            } else {
              setResult({ kind: "err", message: r.message ?? r.error });
            }
          })
        }
      >
        {pending ? "Pinging…" : "Send test ping"}
      </Button>
      {result && result.kind === "ok" && (
        <div className="rounded-md border bg-neutral-50 p-3 text-xs space-y-1">
          <p>
            <strong>HTTP {result.status}</strong> · {result.latency_ms}ms
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap text-neutral-700">
            {result.preview}
          </pre>
          <p className="text-neutral-500">
            Note: handler returns &quot;lead not found&quot; for ping payloads
            (synthetic UUID). HTTP 400 with that reason confirms the HMAC chain
            is wired correctly.
          </p>
        </div>
      )}
      {result && result.kind === "err" && (
        <p className="text-xs text-red-700" role="alert">
          {result.message}
        </p>
      )}
    </div>
  );
}
