/* eslint-disable no-console */
/**
 * Demo data seeder — creates "Skyline Realty Pvt Ltd" with enough data to
 * light up every v2 surface (cockpit compliance, catalog browser,
 * site-visit calendar, booking pipeline widget, CP submissions, Voice IQ
 * delivery log, platform tickets).
 *
 * Idempotent: stable UUIDs derived from a fixed seed string. Re-running
 * upserts existing rows; counts shown as "skipped".
 *
 * Run with: `npm run demo:seed`
 */
import { createClient } from "@supabase/supabase-js";
import { stableUuid } from "./stable-uuid";

const SEED = "skyline-realty-demo-2026-05-09";
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";

const ORG_SLUG = "skyline-realty-demo";
const ORG_NAME = "Skyline Realty Pvt Ltd";
const RERA = "PRM/KA/RERA/1251/308/PR/200405/001234";
const GSTIN = "29AAACS1234A1Z5";

type Counts = { created: number; skipped: number };

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} required (set in .env.local)`);
  return v;
}

function id(seedFragment: string): string {
  return stableUuid(`${SEED}::${seedFragment}`);
}

function isoOffset(daysFromNow: number, hour = 11, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function upsertOrg(client: ReturnType<typeof createClient>, counts: Counts) {
  const orgId = id("org");
  const { data: existing } = await client
    .from("organizations")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();
  if (existing) {
    counts.skipped += 1;
    return orgId;
  }
  const { error } = await client.from("organizations").insert({
    id: orgId,
    slug: ORG_SLUG,
    name: ORG_NAME,
    rera_number: RERA,
    gstin: GSTIN,
    primary_contact_email: "demo@skylinerealty.example",
    plan_tier: "professional",
    onboarding_state: {
      completed: true,
      current_step: "completed",
      completed_steps: [
        "org_details",
        "branding",
        "first_workspace",
        "lead_sources",
        "pipeline_stages",
        "team_users",
        "integrations",
        "sample_demo",
      ],
    },
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });
  if (error) throw error;
  counts.created += 1;
  return orgId;
}

async function upsertWorkspace(
  client: ReturnType<typeof createClient>,
  org_id: string,
  counts: Counts,
) {
  const wsId = id("workspace.default");
  const { data: existing } = await client
    .from("workspaces")
    .select("id")
    .eq("id", wsId)
    .maybeSingle();
  if (existing) {
    counts.skipped += 1;
    return wsId;
  }
  const { error } = await client.from("workspaces").insert({
    id: wsId,
    organization_id: org_id,
    slug: "default",
    name: "Default workspace",
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });
  if (error) throw error;
  counts.created += 1;
  return wsId;
}

async function upsertNode(
  client: ReturnType<typeof createClient>,
  args: {
    id: string;
    organization_id: string;
    workspace_id: string;
    node_type: string;
    label: string;
    state: string | null;
    data: Record<string, unknown>;
  },
  counts: Counts,
) {
  const { data: existing } = await client
    .from("nodes")
    .select("id")
    .eq("id", args.id)
    .maybeSingle();
  if (existing) {
    counts.skipped += 1;
    return;
  }
  const { error } = await client.from("nodes").insert({
    id: args.id,
    organization_id: args.organization_id,
    workspace_id: args.workspace_id,
    node_type: args.node_type,
    label: args.label,
    state: args.state,
    data: args.data,
    created_by: SYSTEM_UUID,
    created_via: "system",
    updated_by: SYSTEM_UUID,
    updated_via: "system",
  });
  if (error) throw error;
  counts.created += 1;
}

async function seedProperty(
  client: ReturnType<typeof createClient>,
  org_id: string,
  ws_id: string,
  counts: Counts,
) {
  const propId = id("property.skyline");
  await upsertNode(
    client,
    {
      id: propId,
      organization_id: org_id,
      workspace_id: ws_id,
      node_type: "property",
      label: "Skyline Towers",
      state: "available",
      data: {
        name: "Skyline Towers",
        city: "Bengaluru",
        rera_number: RERA,
        unit_count: 30,
        address: "Outer Ring Road, Sarjapur, Bengaluru — 560035",
      },
    },
    counts,
  );

  // 30 units across statuses
  const unitStates: Array<"available" | "held" | "booked" | "sold"> = [];
  for (let i = 0; i < 18; i++) unitStates.push("available");
  for (let i = 0; i < 4; i++) unitStates.push("held");
  for (let i = 0; i < 5; i++) unitStates.push("booked");
  for (let i = 0; i < 3; i++) unitStates.push("sold");

  for (let i = 0; i < unitStates.length; i++) {
    const tower = i < 10 ? "A" : i < 20 ? "B" : "C";
    const floor = (i % 10) + 1;
    const bhk = i % 3 === 0 ? 2 : i % 3 === 1 ? 3 : 4;
    const price = bhk === 2 ? 5_500_000 : bhk === 3 ? 8_000_000 : 12_000_000;
    await upsertNode(
      client,
      {
        id: id(`unit.${i}`),
        organization_id: org_id,
        workspace_id: ws_id,
        node_type: "unit",
        label: `${tower}-${floor}0${(i % 10) + 1}`,
        state: unitStates[i],
        data: {
          property_id: propId,
          unit_no: `${tower}-${floor}0${(i % 10) + 1}`,
          bhk,
          floor,
          price,
          carpet_area_sqft: bhk === 2 ? 1100 : bhk === 3 ? 1450 : 1850,
        },
      },
      counts,
    );
  }
}

async function seedLeads(
  client: ReturnType<typeof createClient>,
  org_id: string,
  ws_id: string,
  counts: Counts,
) {
  const states = [
    "new",
    "new",
    "new",
    "contacted",
    "contacted",
    "contacted",
    "contacted",
    "qualified",
    "qualified",
    "qualified",
    "qualified",
    "qualified",
    "qualified",
    "qualified",
    "qualified",
    "qualified",
    "lost",
    "lost",
    "junk",
    "on_hold",
  ];
  for (let i = 0; i < states.length; i++) {
    const phone = `+919${String(8000000000 + i * 137).slice(0, 9)}`;
    await upsertNode(
      client,
      {
        id: id(`lead.${i}`),
        organization_id: org_id,
        workspace_id: ws_id,
        node_type: "lead",
        label: phone,
        state: states[i],
        data: {
          phone,
          source: i % 5 === 0 ? "channel_partner" : i % 4 === 0 ? "facebook" : "magicbricks",
          intent_score: i * 5 % 100,
          custom: i % 5 === 0
            ? {
                cp_submitted_by: SYSTEM_UUID,
                cp_status: "pending",
                source_property: "Skyline Towers Phase 1",
                expected_budget: "₹70L–₹90L",
              }
            : {},
        },
      },
      counts,
    );
  }
}

async function seedDeals(
  client: ReturnType<typeof createClient>,
  org_id: string,
  ws_id: string,
  counts: Counts,
) {
  const stages = [
    "qualified",
    "qualified",
    "qualified",
    "qualified",
    "site_visit_scheduled",
    "site_visit_scheduled",
    "site_visit_done",
    "negotiation",
    "booked",
  ];
  for (let i = 0; i < stages.length; i++) {
    await upsertNode(
      client,
      {
        id: id(`deal.${i}`),
        organization_id: org_id,
        workspace_id: ws_id,
        node_type: "deal",
        label: `Deal #${i + 1}`,
        state: stages[i],
        data: {
          unit_id: id(`unit.${i}`),
          lead_id: id(`lead.${i + 7}`), // qualified leads
          expected_close_amount: 7_000_000 + i * 200_000,
        },
      },
      counts,
    );
  }
}

async function seedSiteVisits(
  client: ReturnType<typeof createClient>,
  org_id: string,
  ws_id: string,
  counts: Counts,
) {
  // Spread across next 7 days
  const visits = [
    { day: 0, state: "scheduled" },
    { day: 1, state: "confirmed" },
    { day: 1, state: "scheduled" },
    { day: 2, state: "scheduled" },
    { day: 3, state: "scheduled" },
    { day: 4, state: "no_show" },
    { day: 5, state: "scheduled" },
  ];
  for (let i = 0; i < visits.length; i++) {
    await upsertNode(
      client,
      {
        id: id(`site_visit.${i}`),
        organization_id: org_id,
        workspace_id: ws_id,
        node_type: "site_visit",
        label: `Visit · day +${visits[i].day}`,
        state: visits[i].state,
        data: {
          lead_id: id(`lead.${i + 7}`),
          property_id: id("property.skyline"),
          scheduled_at: isoOffset(visits[i].day, 11 + (i % 4) * 2),
        },
      },
      counts,
    );
  }
}

async function seedVoiceIqDeliveries(
  client: ReturnType<typeof createClient>,
  org_id: string,
  counts: Counts,
) {
  const deliveries = [
    { kind: "call.audited", status: "ok" as const },
    { kind: "lead.intent_changed", status: "ok" as const },
    { kind: "call.bant_extracted", status: "ok" as const },
  ];
  for (let i = 0; i < deliveries.length; i++) {
    const event_id = `demo-vqi-${i}-${SEED.slice(0, 8)}`;
    const { data: existing } = await client
      .from("event_inbox_log")
      .select("id")
      .eq("organization_id", org_id)
      .eq("event_id", event_id)
      .maybeSingle();
    if (existing) {
      counts.skipped += 1;
      continue;
    }
    const { error } = await client.from("event_inbox_log").insert({
      organization_id: org_id,
      event_id,
      event_kind: deliveries[i].kind,
      source_product: "voice_iq",
      status: deliveries[i].status,
      reason: null,
    });
    if (error) throw error;
    counts.created += 1;
  }
}

async function seedSupportTickets(
  client: ReturnType<typeof createClient>,
  org_id: string,
  counts: Counts,
) {
  const tickets = [
    {
      subject: "Onboarding kickoff",
      body: "Walk us through the demo agenda this Thursday — keen to see Voice IQ in action.",
      status: "open",
      kind: "onboarding",
    },
    {
      subject: "Plan upgrade request",
      body: "We've crossed 30 active leads in week two — want to move from Starter to Professional.",
      status: "open",
      kind: "plan_upgrade_request",
    },
    {
      subject: "WhatsApp template approved",
      body: "Template T-08 (post-site-visit thank-you) just cleared Meta review.",
      status: "closed",
      kind: "integration",
    },
  ];
  for (let i = 0; i < tickets.length; i++) {
    const ticketId = id(`ticket.${i}`);
    const { data: existing } = await client
      .from("support_tickets")
      .select("id")
      .eq("id", ticketId)
      .maybeSingle();
    if (existing) {
      counts.skipped += 1;
      continue;
    }
    const { error } = await client.from("support_tickets").insert({
      id: ticketId,
      organization_id: org_id,
      raised_by: SYSTEM_UUID,
      subject: tickets[i].subject,
      body: tickets[i].body,
      status: tickets[i].status,
      kind: tickets[i].kind,
      created_by: SYSTEM_UUID,
      created_via: "system",
      updated_by: SYSTEM_UUID,
      updated_via: "system",
    });
    if (error) {
      // Schema may not have `kind` column — best-effort. Log and continue.
      console.warn(
        `[seed] support_tickets insert (#${i}) failed: ${error.message}`,
      );
      continue;
    }
    counts.created += 1;
  }
}

export async function runSeed(): Promise<void> {
  const url = envOrThrow("SUPABASE_URL").trim();
  const key = envOrThrow("SUPABASE_SERVICE_ROLE_KEY").trim();
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const counts: Counts = { created: 0, skipped: 0 };

  console.log(`[seed] Skyline Realty demo · seed=${SEED}`);

  const orgId = await upsertOrg(client, counts);
  const wsId = await upsertWorkspace(client, orgId, counts);
  await seedProperty(client, orgId, wsId, counts);
  await seedLeads(client, orgId, wsId, counts);
  await seedDeals(client, orgId, wsId, counts);
  await seedSiteVisits(client, orgId, wsId, counts);
  await seedVoiceIqDeliveries(client, orgId, counts);
  await seedSupportTickets(client, orgId, counts);

  console.log(
    `[seed] org_id=${orgId} · created=${counts.created} · skipped=${counts.skipped}`,
  );
  console.log(`[seed] Demo org ready · /platform/organizations/${orgId}`);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  runSeed().catch((err) => {
    console.error("[seed] FAILED", err);
    process.exit(1);
  });
}
