// D-415 — DLT template registry shim for V1.
//
// Live SMS providers (MSG91 / Gupshup, when wired) require DLT-registered
// templates. For V1 we ship a constants array; when a live provider lands,
// the org_admin registers these same DLT ids in the provider's portal.

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
