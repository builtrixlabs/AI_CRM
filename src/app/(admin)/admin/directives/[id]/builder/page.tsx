import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { resolveForUser } from "@/lib/auth/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listVersionHistory } from "@/lib/workflow-builder";
import type { CompiledDag, TestPayloadEntry } from "@/lib/workflow-builder";
import { BuilderForm } from "./builder-form";

export const dynamic = "force-dynamic";

type DirectiveRow = {
  id: string;
  organization_id: string;
  code: string;
  display_name: string;
  compiled_dag: CompiledDag | null;
  test_payloads: TestPayloadEntry[] | null;
  last_test_passed_at: string | null;
  updated_at: string;
  lifecycle_status: string;
  version: number;
  parent_id: string | null;
};

export default async function BuilderPage(props: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");
  const perms = resolveForUser(user);
  if (!perms.has("directives:author")) redirect("/403");

  const { id } = await props.params;
  const { data } = await getSupabaseAdmin()
    .from("directives")
    .select(
      "id, organization_id, code, display_name, compiled_dag, test_payloads, last_test_passed_at, updated_at, lifecycle_status, version, parent_id",
    )
    .eq("id", id)
    .eq("organization_id", user.org_id)
    .maybeSingle();
  if (!data) notFound();
  const row = data as DirectiveRow;

  const history = await listVersionHistory({
    caller_org_id: user.org_id,
    code: row.code,
  });

  const canPublish =
    !!row.last_test_passed_at &&
    Date.parse(row.last_test_passed_at) > Date.parse(row.updated_at);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="text-xs text-muted-foreground">
          <Link href="/admin/directives" className="underline">
            AI Workflows
          </Link>{" "}
          / <span>{row.display_name}</span>
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {row.display_name}
          </h1>
          <Badge variant="outline">v{row.version}</Badge>
          <Badge
            variant={
              row.lifecycle_status === "live"
                ? "default"
                : row.lifecycle_status === "pending_approval"
                  ? "secondary"
                  : "outline"
            }
          >
            {row.lifecycle_status.replace(/_/g, " ")}
          </Badge>
        </div>
      </header>

      <BuilderForm
        directiveId={row.id}
        initialDag={row.compiled_dag}
        canPublish={canPublish}
        lifecycleStatus={row.lifecycle_status}
        testPayloads={row.test_payloads ?? []}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Version history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length <= 1 ? (
            <p
              className="p-6 text-sm text-muted-foreground"
              data-testid="builder-no-history"
            >
              No prior versions.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between p-3"
                  data-testid={`builder-history-${h.version}`}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <Badge variant="outline">v{h.version}</Badge>
                    <Badge variant="secondary">
                      {h.lifecycle_status.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
