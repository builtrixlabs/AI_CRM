"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { provisionAction, type ProvisionFormState } from "./actions";

const PLAN_TIERS = [
  { id: "starter", label: "Starter (free pilot)" },
  { id: "professional", label: "Professional (₹14,999/mo)" },
  { id: "enterprise", label: "Enterprise (₹49,999/mo)" },
  { id: "custom", label: "Custom (per contract)" },
];

export default function ProvisionOrgPage() {
  const [state, formAction, pending] = useActionState<
    ProvisionFormState,
    FormData
  >(provisionAction, {});

  const err = (key: string) => state.errors?.[key]?.join(", ");

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Provision a new organization
        </h1>
        <p className="text-sm text-neutral-600">
          Creates the org, default workspace, org_admin profile, subscription,
          and a magic-link for the org_admin to sign in.
        </p>
      </header>

      {state.message && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-900 p-3 text-sm">
          {state.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
              {err("name") && <p className="text-xs text-red-600 mt-1">{err("name")}</p>}
            </div>

            <div>
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                placeholder="lowercase-with-dashes"
                pattern="[a-z0-9-]+"
                required
              />
              <p className="text-xs text-neutral-500 mt-1">
                Used in URLs. Lowercase, digits, dashes only.
              </p>
              {err("slug") && <p className="text-xs text-red-600 mt-1">{err("slug")}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rera_number">RERA number (optional)</Label>
                <Input id="rera_number" name="rera_number" />
              </div>
              <div>
                <Label htmlFor="gstin">GSTIN (optional)</Label>
                <Input id="gstin" name="gstin" />
              </div>
            </div>

            <div>
              <Label htmlFor="primary_contact_name">Primary contact name</Label>
              <Input id="primary_contact_name" name="primary_contact_name" required />
              {err("primary_contact_name") && (
                <p className="text-xs text-red-600 mt-1">{err("primary_contact_name")}</p>
              )}
            </div>

            <div>
              <Label htmlFor="primary_contact_email">
                Primary contact email (becomes the org_admin)
              </Label>
              <Input
                id="primary_contact_email"
                name="primary_contact_email"
                type="email"
                required
              />
              {err("primary_contact_email") && (
                <p className="text-xs text-red-600 mt-1">{err("primary_contact_email")}</p>
              )}
            </div>

            <div>
              <Label htmlFor="primary_contact_phone">
                Primary contact phone (optional)
              </Label>
              <Input id="primary_contact_phone" name="primary_contact_phone" />
            </div>

            <div>
              <Label htmlFor="plan_tier">Plan tier</Label>
              <select
                id="plan_tier"
                name="plan_tier"
                className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-300 bg-white text-sm"
                defaultValue="starter"
              >
                {PLAN_TIERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {err("plan_tier") && (
                <p className="text-xs text-red-600 mt-1">{err("plan_tier")}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Provisioning…" : "Provision organization"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
