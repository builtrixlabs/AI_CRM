"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { PermissionDenied } from "@/lib/auth/permissions";
import {
  provisionOrganization,
  provisionOrganizationSchema,
} from "@/lib/platform/provision";

export type ProvisionFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  magic_link_url?: string | null;
};

export async function provisionAction(
  _prev: ProvisionFormState,
  formData: FormData
): Promise<ProvisionFormState> {
  const user = await getCurrentUser();
  if (!user) {
    return { message: "Not authenticated. Please sign in." };
  }

  const raw = {
    name: (formData.get("name") ?? "").toString().trim(),
    slug: (formData.get("slug") ?? "").toString().trim(),
    rera_number: (formData.get("rera_number") ?? "").toString().trim() || undefined,
    gstin: (formData.get("gstin") ?? "").toString().trim() || undefined,
    primary_contact_name: (formData.get("primary_contact_name") ?? "").toString().trim(),
    primary_contact_email: (formData.get("primary_contact_email") ?? "").toString().trim(),
    primary_contact_phone:
      (formData.get("primary_contact_phone") ?? "").toString().trim() || undefined,
    plan_tier: (formData.get("plan_tier") ?? "starter").toString() as
      | "starter"
      | "professional"
      | "enterprise"
      | "custom",
  };

  const parsed = provisionOrganizationSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_form";
      (errors[key] ||= []).push(issue.message);
    }
    return { errors, message: "Validation failed." };
  }

  let provisioned;
  try {
    provisioned = await provisionOrganization(user, parsed.data);
  } catch (err) {
    if (err instanceof PermissionDenied) {
      return { message: "Forbidden — only super_admin may provision organizations." };
    }
    if (err instanceof ZodError) {
      return { message: err.message };
    }
    const msg = err instanceof Error ? err.message : "Provisioning failed.";
    return { message: msg };
  }

  redirect(`/platform/organizations/${provisioned.organization_id}`);
}
