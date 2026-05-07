"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_PIPELINE_STAGES,
  HARD_GATED_STEPS,
  STEP_IDS,
  type StepId,
} from "@/lib/admin/types";
import { LEAD_SOURCES } from "@/lib/nodes/schemas/lead";
import { onboardingAction, type OnboardingActionState } from "./actions";

const STEP_LABEL: Record<StepId, string> = {
  org_details: "Step 1 · Org details",
  branding: "Step 2 · Branding",
  first_workspace: "Step 3 · First workspace",
  lead_sources: "Step 4 · Lead sources",
  pipeline_stages: "Step 5 · Pipeline stages",
  team_users: "Step 6 · Add team users",
  integrations: "Step 7 · Configure integrations",
  sample_demo: "Step 8 · Sample lead demo",
};

const STEP_HELP: Record<StepId, string> = {
  org_details:
    "Confirm or update RERA, GSTIN, and your primary contact. This step is required.",
  branding:
    "Optional. Set your primary color and logo URL — agent-sent comms will use these.",
  first_workspace:
    "Rename the default workspace to something like 'Mumbai Sales'. Required.",
  lead_sources:
    "Pick the channels your team currently captures leads from.",
  pipeline_stages:
    "We ship a 7-stage default. Customisation lands in a later directive — confirm to continue.",
  team_users:
    "Invite up to 3 teammates now. You can add more later from Users.",
  integrations:
    "Pick providers for email, WhatsApp, telephony. Real wiring lands when each integration directive ships.",
  sample_demo:
    "Quick walkthrough of a synthetic lead. No real data is created.",
};

export function Wizard(props: {
  currentStep: StepId;
  completedSteps: StepId[];
  stepNumber: number;
  leadSources: string[];
  pipelineStages: string[];
}) {
  const [state, action, pending] = useActionState<
    OnboardingActionState,
    FormData
  >(onboardingAction, {});

  const step = props.currentStep;
  const isHardGate = HARD_GATED_STEPS.has(step);

  const err = (key: string) => state.errors?.[key]?.join(", ");

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
        <p className="text-sm text-neutral-600">
          {STEP_LABEL[step]} of 8 — {props.stepNumber} of {STEP_IDS.length}
        </p>
      </header>

      {state.message && (
        <div className="rounded-md border border-red-200 bg-red-50 text-red-900 p-3 text-sm">
          {state.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{STEP_LABEL[step]}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-600 mb-4">{STEP_HELP[step]}</p>

          <form action={action} className="space-y-4">
            <input type="hidden" name="step" value={step} />

            {step === "org_details" && (
              <>
                <Field
                  id="primary_contact_name"
                  label="Primary contact name"
                  required
                  err={err("primary_contact_name")}
                />
                <Field
                  id="primary_contact_email"
                  label="Primary contact email"
                  type="email"
                  required
                  err={err("primary_contact_email")}
                />
                <Field id="rera_number" label="RERA number (optional)" />
                <Field id="gstin" label="GSTIN (optional)" />
              </>
            )}

            {step === "branding" && (
              <>
                <Field
                  id="primary_color"
                  label="Primary color (hex, e.g. #1a1a1a)"
                  err={err("primary_color")}
                />
                <Field
                  id="accent_color"
                  label="Accent color (optional, hex)"
                />
                <Field
                  id="logo_url"
                  label="Logo URL (optional)"
                  type="url"
                  err={err("logo_url")}
                />
              </>
            )}

            {step === "first_workspace" && (
              <>
                <Field
                  id="name"
                  label="Workspace name"
                  required
                  err={err("name")}
                />
                <Field
                  id="slug"
                  label="Slug (lowercase, dashes)"
                  required
                  pattern="[a-z0-9-]+"
                  err={err("slug")}
                />
              </>
            )}

            {step === "lead_sources" && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Pick at least one source:
                </legend>
                {LEAD_SOURCES.map((src) => (
                  <label
                    key={src}
                    className="flex items-center gap-2 text-sm capitalize"
                  >
                    <input
                      type="checkbox"
                      name="sources"
                      value={src}
                      defaultChecked={props.leadSources.includes(src)}
                    />
                    {src.replace(/_/g, " ")}
                  </label>
                ))}
                {err("sources") && (
                  <p className="text-xs text-red-600">{err("sources")}</p>
                )}
              </fieldset>
            )}

            {step === "pipeline_stages" && (
              <ul className="text-sm font-mono space-y-1">
                {DEFAULT_PIPELINE_STAGES.map((s, i) => (
                  <li key={s} className="text-neutral-700">
                    {i + 1}. {s}
                  </li>
                ))}
              </ul>
            )}

            {step === "team_users" && (
              <>
                <p className="text-sm text-neutral-600">
                  Up to 3 teammates. Leave rows blank to invite fewer.
                </p>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <Input
                      name={`invite_${i}_email`}
                      placeholder="email@example.com"
                      type="email"
                    />
                    <Input
                      name={`invite_${i}_name`}
                      placeholder="Display name"
                    />
                    <select
                      name={`invite_${i}_role`}
                      className="px-3 py-2 rounded-md border border-neutral-300 bg-white text-sm"
                      defaultValue="sales_rep"
                    >
                      <option value="manager">Manager</option>
                      <option value="sales_rep">Sales rep</option>
                      <option value="read_only">Read only</option>
                      <option value="channel_partner">Channel partner</option>
                    </select>
                  </div>
                ))}
              </>
            )}

            {step === "integrations" && (
              <>
                <SelectField
                  id="email"
                  label="Email provider"
                  options={[
                    { value: "", label: "(skip — pick later)" },
                    { value: "smtp", label: "SMTP" },
                    { value: "resend", label: "Resend" },
                  ]}
                />
                <SelectField
                  id="whatsapp"
                  label="WhatsApp provider"
                  options={[
                    { value: "", label: "(skip — pick later)" },
                    { value: "meta", label: "Meta" },
                    { value: "gupshup", label: "Gupshup" },
                    { value: "wati", label: "Wati" },
                  ]}
                />
                <SelectField
                  id="telephony"
                  label="Telephony provider"
                  options={[
                    { value: "", label: "(skip — pick later)" },
                    { value: "exotel", label: "Exotel" },
                    { value: "myoperator", label: "MyOperator" },
                    { value: "knowlarity", label: "Knowlarity" },
                  ]}
                />
              </>
            )}

            {step === "sample_demo" && (
              <div className="rounded-md border bg-neutral-50 p-4 text-sm space-y-2">
                <p className="font-medium">Synthetic lead walkthrough</p>
                <p className="text-neutral-700">
                  <strong>Priya Sharma</strong> · 3 BHK · Bangalore · ₹1.8 Cr
                </p>
                <ol className="list-decimal pl-5 text-neutral-700 space-y-1">
                  <li>Lead arrives from a walk-in source</li>
                  <li>Lead Enrichment Agent scores intent (87/100)</li>
                  <li>Sales rep schedules a Saturday site visit</li>
                  <li>Site visit completes; deal moves to Booked</li>
                </ol>
                <p className="text-xs text-neutral-500 mt-2">
                  Click "Finish" to mark onboarding complete and head to your
                  cockpit. No real lead is created.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              {!isHardGate && step !== "sample_demo" && (
                <Button
                  type="submit"
                  variant="outline"
                  name="skip"
                  value="1"
                  disabled={pending}
                >
                  Skip for now
                </Button>
              )}
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Saving…"
                  : step === "sample_demo"
                    ? "Finish onboarding"
                    : "Next"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-neutral-500">
        Completed steps: {props.completedSteps.length} of {STEP_IDS.length}.
      </p>
    </div>
  );
}

function Field(props: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  pattern?: string;
  err?: string;
}) {
  return (
    <div>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        name={props.id}
        type={props.type ?? "text"}
        required={props.required}
        pattern={props.pattern}
      />
      {props.err && <p className="text-xs text-red-600 mt-1">{props.err}</p>}
    </div>
  );
}

function SelectField(props: {
  id: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <Label htmlFor={props.id}>{props.label}</Label>
      <select
        id={props.id}
        name={props.id}
        className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-300 bg-white text-sm"
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
