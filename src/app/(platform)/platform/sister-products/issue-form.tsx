"use client";

import { useState, useTransition } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { issueTokenAction } from "./actions";
import type { ProductKind } from "@/lib/integrations/sister-products/token";

type Org = { id: string; name: string };

type Props = {
  orgs: Org[];
};

type Issued = { token: string; last4: string };

const PRODUCT_OPTIONS: { id: ProductKind; label: string }[] = [
  { id: "post_sales_crm", label: "Post-Sales CRM" },
  { id: "lead_sources", label: "Lead sources app" },
  { id: "legal_auditor", label: "Legal Auditor" },
];

export function IssueTokenForm({ orgs }: Props) {
  const [orgId, setOrgId] = useState<string>(orgs[0]?.id ?? "");
  const [productKind, setProductKind] = useState<ProductKind>(
    "post_sales_crm",
  );
  const [pending, startTransition] = useTransition();
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIssued(null);
    setError(null);
    setCopied(false);
    if (!orgId) {
      setError("pick an organization");
      return;
    }
    const form = new FormData();
    form.set("organization_id", orgId);
    form.set("product_kind", productKind);
    startTransition(async () => {
      const res = await issueTokenAction(form);
      if (res.ok) {
        setIssued({ token: res.token, last4: res.last4 });
      } else {
        setError(res.error);
      }
    });
  }

  async function handleCopy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback handled by user manually selecting + copying.
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end"
      >
        <div>
          <Label htmlFor="organization_id">Organization</Label>
          <select
            id="organization_id"
            data-testid="sp-org"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {orgs.length === 0 && <option value="">(no orgs)</option>}
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="product_kind">Product</Label>
          <select
            id="product_kind"
            data-testid="sp-product"
            value={productKind}
            onChange={(e) => setProductKind(e.target.value as ProductKind)}
            className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            {PRODUCT_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          disabled={pending || !orgId}
          data-testid="sp-issue"
        >
          {pending ? "Issuing…" : "Issue token"}
        </Button>
      </form>

      {error && (
        <div
          data-testid="sp-error"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {issued && (
        <div
          data-testid="sp-issued"
          className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="font-medium">
            Copy this token now — it can&apos;t be retrieved later.
          </p>
          <div className="flex items-center gap-2">
            <code
              data-testid="sp-token"
              className="flex-1 break-all rounded-md border border-amber-400/50 bg-amber-100/50 px-2 py-1.5 font-mono text-xs dark:bg-amber-900/30"
            >
              {issued.token}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopy}
              data-testid="sp-copy"
            >
              {copied ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copy
                </>
              )}
            </Button>
          </div>
          <p className="text-xs">
            Last 4: <span className="font-mono">{issued.last4}</span> (this is
            all we&apos;ll show in the table below). Re-issuing a token revokes
            the old one only when you explicitly revoke it — two active tokens
            for the same (org, product) are allowed.
          </p>
        </div>
      )}
    </div>
  );
}
