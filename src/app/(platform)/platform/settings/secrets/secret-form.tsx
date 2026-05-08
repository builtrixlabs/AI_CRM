"use client";

import { useState, useTransition } from "react";
import { setSecretAction } from "./actions";
import { SECRET_LABELS, type SecretKind, type RedactedSecret } from "@/lib/secrets/types";

type Props = {
  rows: RedactedSecret[];
};

export function SecretsTable({ rows }: Props) {
  const [editing, setEditing] = useState<SecretKind | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SecretKind | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(kind: SecretKind, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await setSecretAction(fd);
      if (res.ok) {
        setEditing(null);
        setValue("");
        setSuccess(kind);
        setTimeout(() => setSuccess(null), 3500);
      } else {
        setError(res.message ?? res.error);
      }
    });
  }

  return (
    <div className="border rounded-md divide-y">
      {rows.map((row) => {
        const isEditing = editing === row.kind;
        return (
          <div key={row.kind} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium text-sm">
                  {SECRET_LABELS[row.kind]}
                </div>
                <code className="text-xs text-neutral-500 font-mono">
                  {row.kind}
                </code>
              </div>
              <div className="flex items-center gap-3">
                <SourceBadge row={row} />
                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row.kind);
                      setValue("");
                      setError(null);
                    }}
                    className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
                  >
                    {row.is_set ? "Rotate" : "Set"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setValue("");
                      setError(null);
                    }}
                    className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {isEditing && (
              <form onSubmit={(e) => onSubmit(row.kind, e)} className="flex gap-2">
                <input type="hidden" name="kind" value={row.kind} />
                <input
                  type="password"
                  name="value"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder={
                    row.is_set
                      ? "Paste new value to rotate"
                      : "Paste value to set"
                  }
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-mono"
                />
                <button
                  type="submit"
                  disabled={pending || value.length < 8}
                  className="rounded-md bg-neutral-900 text-white px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save"}
                </button>
              </form>
            )}

            {error && isEditing && (
              <p className="text-xs text-red-600">{error}</p>
            )}
            {success === row.kind && (
              <p className="text-xs text-emerald-700">
                Saved. Cache invalidated; next API call uses the new value.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SourceBadge({ row }: { row: RedactedSecret }) {
  if (!row.is_set) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">
        Not set
      </span>
    );
  }
  if (row.source === "db") {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">
        DB · ****{row.last4}
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
      Env fallback · ****{row.last4}
    </span>
  );
}
