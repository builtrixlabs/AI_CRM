"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { publishToTeamAction } from "./actions";

type Props = {
  dashboardId: string;
  teams: Array<{ id: string; name: string }>;
};

export function PublishToTeamForm({ dashboardId, teams }: Props) {
  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? "");
  const [isDefault, setIsDefault] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId) return;
    setError(null);
    setSuccess(null);
    start(async () => {
      const r = await publishToTeamAction(dashboardId, teamId, isDefault);
      if (!r.ok) {
        setError(
          r.reason === "permission"
            ? "Permission denied."
            : r.reason === "validation"
              ? "Invalid id."
              : r.reason === "cross_tenant"
                ? "That team is from another org."
                : r.reason === "not_found"
                  ? "Team or dashboard not found."
                  : `Internal error: ${r.message ?? ""}`,
        );
      } else {
        setSuccess(r.idempotent ? "Already published to this team." : "Published.");
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3"
      data-testid="publish-team-form"
    >
      <div className="flex-1 min-w-[200px]">
        <Label htmlFor="team">Team</Label>
        <select
          id="team"
          className="block h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          data-testid="publish-team-pick"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          data-testid="publish-team-default"
        />
        Set as default
      </label>
      <Button
        type="submit"
        disabled={pending || !teamId}
        data-testid="publish-team-submit"
      >
        {pending ? "Publishing…" : "Publish"}
      </Button>
      {error && (
        <p className="w-full text-sm text-destructive" data-testid="publish-team-error">
          {error}
        </p>
      )}
      {success && !error && (
        <p className="w-full text-sm text-emerald-600" data-testid="publish-team-success">
          {success}
        </p>
      )}
    </form>
  );
}
