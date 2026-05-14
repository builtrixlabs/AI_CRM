"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createRuleAction,
  toggleRuleAction,
  deleteRuleAction,
  createTeamAction,
  addTeamMemberAction,
  removeTeamMemberAction,
  type AllocationActionResult,
} from "@/app/(admin)/admin/allocation-rules/actions";
import type {
  AllocationRule,
  AllocationTargetKind,
} from "@/lib/leads/allocation-engine";
import type { TeamWithMembers } from "@/lib/leads/allocation-admin";
import type { OrgRep } from "@/lib/projects/sales-mapping";

const SOURCE_CHANNELS = [
  "paid_social",
  "paid_search",
  "aggregator",
  "organic_web",
  "walk_in",
  "cp",
];

function parseList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
function parseNumList(s: string): number[] {
  return parseList(s)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

type RunFn = (fn: () => Promise<AllocationActionResult>) => void;

export function AllocationManager({
  rules,
  teams,
  reps,
}: {
  rules: AllocationRule[];
  teams: TeamWithMembers[];
  reps: OrgRep[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run: RunFn = (fn) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.message ?? r.reason);
    });
  };

  return (
    <div className="space-y-8" data-testid="allocation-manager">
      <TeamsSection teams={teams} reps={reps} pending={pending} run={run} />
      <RulesSection
        rules={rules}
        teams={teams}
        reps={reps}
        pending={pending}
        run={run}
      />
      {error && (
        <p
          className="text-xs text-red-600"
          role="alert"
          data-testid="allocation-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function TeamsSection({
  teams,
  reps,
  pending,
  run,
}: {
  teams: TeamWithMembers[];
  reps: OrgRep[];
  pending: boolean;
  run: RunFn;
}) {
  const [newTeam, setNewTeam] = useState("");
  return (
    <section data-testid="allocation-teams">
      <h2 className="text-lg font-medium">Teams</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Round-robin and first-available rules assign within a team.
      </p>

      <div className="mt-3 flex items-end gap-2 rounded border border-neutral-200 p-3">
        <label className="flex flex-1 flex-col gap-1 text-xs text-neutral-600">
          New team name
          <input
            className="h-8 rounded border border-neutral-300 px-2 text-sm"
            value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)}
            data-testid="team-name-input"
          />
        </label>
        <Button
          type="button"
          size="sm"
          disabled={pending || !newTeam.trim()}
          onClick={() => {
            const name = newTeam.trim();
            setNewTeam("");
            run(() => createTeamAction(name));
          }}
          data-testid="create-team-btn"
        >
          Create team
        </Button>
      </div>

      <ul className="mt-3 space-y-3">
        {teams.length === 0 ? (
          <li
            className="rounded border border-neutral-200 px-4 py-3 text-sm text-neutral-500"
            data-testid="teams-empty"
          >
            No teams yet.
          </li>
        ) : (
          teams.map((t) => (
            <TeamRow key={t.id} team={t} reps={reps} pending={pending} run={run} />
          ))
        )}
      </ul>
    </section>
  );
}

function TeamRow({
  team,
  reps,
  pending,
  run,
}: {
  team: TeamWithMembers;
  reps: OrgRep[];
  pending: boolean;
  run: RunFn;
}) {
  const [selected, setSelected] = useState("");
  const memberIds = new Set(team.members.map((m) => m.profile_id));
  const available = reps.filter((r) => !memberIds.has(r.id));

  return (
    <li
      className="rounded border border-neutral-200 p-3"
      data-testid={`team-${team.id}`}
    >
      <div className="font-medium">{team.name}</div>
      <ul className="mt-2 space-y-1">
        {team.members.length === 0 ? (
          <li className="text-xs text-neutral-500">No members yet.</li>
        ) : (
          team.members.map((m) => (
            <li
              key={m.profile_id}
              className="flex items-center justify-between text-sm"
              data-testid={`team-${team.id}-member-${m.profile_id}`}
            >
              <span>{m.display_name}</span>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => removeTeamMemberAction(team.id, m.profile_id))
                }
                data-testid={`team-${team.id}-remove-${m.profile_id}`}
              >
                Remove
              </Button>
            </li>
          ))
        )}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <select
          className="h-8 flex-1 rounded border border-neutral-300 px-2 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          data-testid={`team-${team.id}-add-select`}
        >
          <option value="">Add a member…</option>
          {available.map((r) => (
            <option key={r.id} value={r.id}>
              {r.display_name} · {r.base_role}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          disabled={pending || !selected}
          onClick={() => {
            if (!selected) return;
            const pid = selected;
            setSelected("");
            run(() => addTeamMemberAction(team.id, pid));
          }}
          data-testid={`team-${team.id}-add-btn`}
        >
          Add
        </Button>
      </div>
    </li>
  );
}

function RulesSection({
  rules,
  teams,
  reps,
  pending,
  run,
}: {
  rules: AllocationRule[];
  teams: TeamWithMembers[];
  reps: OrgRep[];
  pending: boolean;
  run: RunFn;
}) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState("100");
  const [source, setSource] = useState("");
  const [sourceChannel, setSourceChannel] = useState("");
  const [budgetBands, setBudgetBands] = useState("");
  const [cities, setCities] = useState("");
  const [bhks, setBhks] = useState("");
  const [targetKind, setTargetKind] =
    useState<AllocationTargetKind>("team_round_robin");
  const [targetUser, setTargetUser] = useState("");
  const [targetTeam, setTargetTeam] = useState("");

  function submit() {
    const conditions: Record<string, unknown> = {};
    if (source.trim()) conditions.source = source.trim();
    if (sourceChannel) conditions.source_channel = sourceChannel;
    if (budgetBands.trim()) conditions.budget_band_in = parseList(budgetBands);
    if (cities.trim()) conditions.city_in = parseList(cities);
    if (bhks.trim()) conditions.bhk_in = parseNumList(bhks);

    run(() =>
      createRuleAction({
        name,
        priority: Number(priority),
        conditions,
        target_kind: targetKind,
        target_user_id: targetKind === "user" ? targetUser : null,
        target_team_id: targetKind !== "user" ? targetTeam : null,
      }),
    );
  }

  return (
    <section data-testid="allocation-rules">
      <h2 className="text-lg font-medium">Allocation rules</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Lower priority wins. The first rule whose conditions all match an
        incoming lead assigns it.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 rounded border border-neutral-200 p-3">
        <Field label="Rule name">
          <input
            className="h-8 w-full rounded border border-neutral-300 px-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="rule-name-input"
          />
        </Field>
        <Field label="Priority (lower wins)">
          <input
            type="number"
            className="h-8 w-full rounded border border-neutral-300 px-2 text-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            data-testid="rule-priority-input"
          />
        </Field>
        <Field label="source (exact, optional)">
          <input
            className="h-8 w-full rounded border border-neutral-300 px-2 text-sm"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. meta_lead_ads"
            data-testid="rule-source-input"
          />
        </Field>
        <Field label="source channel (optional)">
          <select
            className="h-8 w-full rounded border border-neutral-300 px-2 text-sm"
            value={sourceChannel}
            onChange={(e) => setSourceChannel(e.target.value)}
            data-testid="rule-channel-select"
          >
            <option value="">Any channel</option>
            {SOURCE_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="budget bands (comma-separated, optional)">
          <input
            className="h-8 w-full rounded border border-neutral-300 px-2 text-sm"
            value={budgetBands}
            onChange={(e) => setBudgetBands(e.target.value)}
            placeholder="1.5-2Cr, 2Cr+"
            data-testid="rule-budget-input"
          />
        </Field>
        <Field label="cities (comma-separated, optional)">
          <input
            className="h-8 w-full rounded border border-neutral-300 px-2 text-sm"
            value={cities}
            onChange={(e) => setCities(e.target.value)}
            data-testid="rule-city-input"
          />
        </Field>
        <Field label="BHK (comma-separated numbers, optional)">
          <input
            className="h-8 w-full rounded border border-neutral-300 px-2 text-sm"
            value={bhks}
            onChange={(e) => setBhks(e.target.value)}
            placeholder="2, 3"
            data-testid="rule-bhk-input"
          />
        </Field>
        <Field label="Target">
          <select
            className="h-8 w-full rounded border border-neutral-300 px-2 text-sm"
            value={targetKind}
            onChange={(e) =>
              setTargetKind(e.target.value as AllocationTargetKind)
            }
            data-testid="rule-target-kind-select"
          >
            <option value="team_round_robin">Team · round-robin</option>
            <option value="team_first_available">
              Team · first available
            </option>
            <option value="user">Specific user</option>
          </select>
        </Field>
        {targetKind === "user" ? (
          <Field label="Target user">
            <select
              className="h-8 w-full rounded border border-neutral-300 px-2 text-sm"
              value={targetUser}
              onChange={(e) => setTargetUser(e.target.value)}
              data-testid="rule-target-user-select"
            >
              <option value="">Select a user…</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name} · {r.base_role}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Target team">
            <select
              className="h-8 w-full rounded border border-neutral-300 px-2 text-sm"
              value={targetTeam}
              onChange={(e) => setTargetTeam(e.target.value)}
              data-testid="rule-target-team-select"
            >
              <option value="">Select a team…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.members.length})
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="col-span-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={pending || !name.trim()}
            onClick={submit}
            data-testid="create-rule-btn"
          >
            Create rule
          </Button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {rules.length === 0 ? (
          <li
            className="rounded border border-neutral-200 px-4 py-3 text-sm text-neutral-500"
            data-testid="rules-empty"
          >
            No allocation rules yet — incoming leads stay unassigned.
          </li>
        ) : (
          rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center justify-between rounded border border-neutral-200 px-4 py-3"
              data-testid={`rule-${rule.id}`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{rule.name}</span>
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                    P{rule.priority}
                  </span>
                  {!rule.active && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800">
                      Disabled
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-500">
                  {summariseConditions(rule)} → {rule.target_kind}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => toggleRuleAction(rule.id, !rule.active))
                  }
                  data-testid={`rule-toggle-${rule.id}`}
                >
                  {rule.active ? "Disable" : "Enable"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => run(() => deleteRuleAction(rule.id))}
                  data-testid={`rule-delete-${rule.id}`}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-600">
      {label}
      {children}
    </label>
  );
}

function summariseConditions(rule: AllocationRule): string {
  const c = rule.conditions ?? {};
  const parts: string[] = [];
  if (c.source) parts.push(`source=${c.source}`);
  if (c.source_channel) parts.push(`channel=${c.source_channel}`);
  if (c.budget_band_in?.length) parts.push(`budget∈[${c.budget_band_in.join(",")}]`);
  if (c.city_in?.length) parts.push(`city∈[${c.city_in.join(",")}]`);
  if (c.bhk_in?.length) parts.push(`bhk∈[${c.bhk_in.join(",")}]`);
  return parts.length > 0 ? parts.join(" · ") : "any lead";
}
