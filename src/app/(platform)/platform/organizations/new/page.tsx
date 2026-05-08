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
          Creates the org, default workspace, subscription, and an
          org_admin auth user with the password you set below. No
          email is sent — share credentials out of band.
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

            <div>
              <Label htmlFor="gstin">GSTIN (optional)</Label>
              <Input id="gstin" name="gstin" />
            </div>

            <div className="pt-4 border-t">
              <h3 className="font-medium text-sm mb-3">Org admin (initial user)</h3>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="primary_contact_name">Name</Label>
                  <Input id="primary_contact_name" name="primary_contact_name" required />
                  {err("primary_contact_name") && (
                    <p className="text-xs text-red-600 mt-1">{err("primary_contact_name")}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="primary_contact_email">Email (used to sign in)</Label>
                  <Input
                    id="primary_contact_email"
                    name="primary_contact_email"
                    type="email"
                    required
                    autoComplete="off"
                  />
                  {err("primary_contact_email") && (
                    <p className="text-xs text-red-600 mt-1">{err("primary_contact_email")}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="primary_contact_phone">Phone (optional)</Label>
                  <Input id="primary_contact_phone" name="primary_contact_phone" />
                </div>

                <div>
                  <Label htmlFor="org_admin_password">
                    Initial password (min 8 chars)
                  </Label>
                  <Input
                    id="org_admin_password"
                    name="org_admin_password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    The org_admin will sign in with email + this password. Share
                    out of band; recommend rotating after first login.
                  </p>
                  {err("org_admin_password") && (
                    <p className="text-xs text-red-600 mt-1">{err("org_admin_password")}</p>
                  )}
                </div>
              </div>
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
