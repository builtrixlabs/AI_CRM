export type OrgRow = {
  id: string;
  slug: string;
  name: string;
  plan_tier: "starter" | "professional" | "enterprise" | "custom";
  rera_number: string | null;
  gstin: string | null;
  primary_contact_email: string | null;
  created_at: string;
};

export type OrgAdminRow = {
  id: string;
  email: string;
  display_name: string;
  base_role: "org_owner" | "org_admin";
  created_at: string;
};

export type SubscriptionSummary = {
  plan_tier: OrgRow["plan_tier"];
  status:
    | "trial"
    | "active"
    | "past_due"
    | "suspended"
    | "cancelled";
  starts_at: string;
  current_period_end: string | null;
};

export type AuditRow = {
  id: string;
  ts: string;
  actor_id: string;
  actor_role: string;
  action: string;
  table_name: string;
  record_id: string | null;
  organization_id: string | null;
};

export type OrgDetail = OrgRow & {
  admins: OrgAdminRow[];
  subscription: SubscriptionSummary | null;
  recent_audit: AuditRow[];
};

export type PlatformCounts = {
  total_orgs: number;
  active_orgs: number;
  org_admins: number;
};

export type AuditFilters = {
  organization_id?: string | null;
  /** D-606 — filter by actor_id (the user who performed the action). */
  user_id?: string | null;
  action?: string | null;
  from_ts?: string | null;
  to_ts?: string | null;
};
