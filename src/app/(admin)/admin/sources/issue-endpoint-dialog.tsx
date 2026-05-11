"use client";

import * as React from "react";
import { useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sourcesAction } from "./actions";

export function IssueEndpointDialog() {
  const [open, setOpen] = React.useState(false);
  const [issuedToken, setIssuedToken] = React.useState<string | null>(null);
  const [label, setLabel] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setIssuedToken(null);
    setLabel("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("intent", "issue");
      fd.set("label", label);
      const r = await sourcesAction(fd);
      if (r.ok) {
        setIssuedToken(r.data?.token ?? null);
      } else {
        setError(r.message ?? "Failed to issue endpoint");
      }
    });
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        data-testid="issue-endpoint-trigger"
      >
        + Issue endpoint
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) reset();
          setOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue webform endpoint</DialogTitle>
            <DialogDescription>
              The token is shown ONCE. Copy it somewhere safe — there is no way
              to retrieve it later (you'd need to revoke and reissue).
            </DialogDescription>
          </DialogHeader>

          {issuedToken == null ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  name="label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Meta Lead Ads — Lakeside campaign"
                  required
                  data-testid="issue-endpoint-label"
                />
              </div>
              {error && (
                <p className="text-xs text-rose-700" role="alert">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={pending || label.trim().length < 1}
                  onClick={submit}
                  data-testid="issue-endpoint-submit"
                >
                  {pending ? "Issuing…" : "Issue endpoint"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                Copy this token now. It will not be shown again.
              </div>
              <div className="space-y-1">
                <Label>Endpoint token</Label>
                <textarea
                  readOnly
                  value={issuedToken}
                  className="w-full rounded border border-neutral-200 p-2 font-mono text-xs"
                  rows={3}
                  data-testid="issued-endpoint-token"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <div className="text-xs text-neutral-600">
                POST leads to{" "}
                <code>/api/leads/ingest/{issuedToken.slice(0, 12)}…</code>
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
