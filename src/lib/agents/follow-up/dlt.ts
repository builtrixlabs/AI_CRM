// D-415 — DLT template registry shim for V1.
//
// Live SMS providers (MSG91 / Gupshup, when wired) require DLT-registered
// templates. For V1 we ship a constants array; when a live provider lands,
// the org_admin registers these same DLT ids in the provider's portal.
//
// D-603 — adds the WhatsApp equivalent (FOLLOW_UP_WA_TEMPLATES) and the
// id set passed to resolveOrgAdapter("sms", …) so a live MSG91 adapter
// accepts the follow-up template.

export type FollowUpDltTemplate = {
  id: string;
  body_template: string; // {{var}} interpolation
  language: "en" | "hi";
};

export const FOLLOW_UP_DLT_TEMPLATES: readonly FollowUpDltTemplate[] = [
  {
    id: "follow_up_default",
    body_template:
      "Hi {{name}}, this is {{org_name}}. We're checking in on your interest. Reply STOP to opt out.",
    language: "en",
  },
] as const;

// WhatsApp Business sends are template-only; the follow-up agent's whatsapp
// branch names this template id, and the org must have it in its
// org_whatsapp_endpoints.approved_template_ids.
export type FollowUpWaTemplate = {
  id: string;
  language_code: string; // WhatsApp Business language code, e.g. "en_US"
};

export const FOLLOW_UP_WA_TEMPLATES: readonly FollowUpWaTemplate[] = [
  {
    id: "follow_up_default",
    language_code: "en_US",
  },
] as const;

// The follow-up DLT template ids as a set — passed to
// resolveOrgAdapter("sms", …) so the resolved MSG91 adapter accepts them.
export const FOLLOW_UP_DLT_TEMPLATE_IDS: ReadonlySet<string> = new Set(
  FOLLOW_UP_DLT_TEMPLATES.map((t) => t.id),
);

export function getDltTemplate(id: string): FollowUpDltTemplate | null {
  return FOLLOW_UP_DLT_TEMPLATES.find((t) => t.id === id) ?? null;
}

/**
 * Register every follow-up DLT template id with a MockSmsProvider so its
 * template-not-found check passes for the V1 default catalog.
 */
export function registerFollowUpDltTemplates(provider: {
  registerTemplate: (id: string) => void;
}): void {
  for (const t of FOLLOW_UP_DLT_TEMPLATES) provider.registerTemplate(t.id);
}
