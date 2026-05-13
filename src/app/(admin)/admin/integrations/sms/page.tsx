import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isEncryptionConfigured } from "@/lib/comms/encryption";
import { SmsForm } from "./form";
import { DltTemplatesPanel } from "./dlt-templates";

export const dynamic = "force-dynamic";

type SmsRedactedRow = {
  organization_id: string;
  provider: string;
  is_configured: boolean;
  sender_id: string | null;
  dlt_entity_id: string | null;
  is_active: boolean;
  test_ping_at: string | null;
  test_ping_ok: boolean | null;
  test_ping_message: string | null;
};

type DltTemplateRow = {
  template_id: string;
  content: string;
  category: "promotional" | "transactional" | "service";
  registered_at: string;
};

export default async function SmsConfigPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const supabase = await createSupabaseServerClient();
  const [{ data: rawRow }, { data: rawTemplates }] = await Promise.all([
    supabase
      .from("org_sms_config_redacted")
      .select(
        "organization_id, provider, is_configured, sender_id, dlt_entity_id, is_active, test_ping_at, test_ping_ok, test_ping_message",
      )
      .eq("organization_id", user.org_id)
      .maybeSingle(),
    supabase
      .from("dlt_templates")
      .select("template_id, content, category, registered_at")
      .eq("organization_id", user.org_id)
      .order("registered_at", { ascending: false }),
  ]);
  const row = rawRow as SmsRedactedRow | null;
  const templates = (rawTemplates as DltTemplateRow[] | null) ?? [];

  const encryptionConfigured = isEncryptionConfigured();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link
          href="/admin/integrations"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to integrations
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <MessageSquare
            className="h-5 w-5"
            style={{ color: "var(--amethyst-700)" }}
          />
          SMS integration
        </h1>
        <p className="text-sm text-muted-foreground">
          Plug in your organization&apos;s MSG91 authkey + DLT
          (TRAI-registered) templates to enable transactional SMS. Every
          send is template-id-gated; non-templated sends are rejected
          fail-closed.
        </p>
      </div>

      {!encryptionConfigured && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm">
            <strong>Server not provisioned for integration encryption.</strong>{" "}
            The operator must set{" "}
            <code className="font-mono">INTEGRATION_ENCRYPTION_KEY</code> in the
            runtime environment before credentials can be saved.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Status
            {row?.is_configured && row?.is_active ? (
              <Badge>Active</Badge>
            ) : row?.is_configured ? (
              <Badge variant="outline">Configured · inactive</Badge>
            ) : (
              <Badge variant="outline">Not configured</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="text-muted-foreground">
            Provider: <span className="font-mono">{row?.provider ?? "—"}</span>
          </p>
          <p className="text-muted-foreground">
            Sender ID:{" "}
            <span className="font-mono">{row?.sender_id ?? "—"}</span>
          </p>
          <p className="text-muted-foreground">
            DLT entity ID:{" "}
            <span className="font-mono">{row?.dlt_entity_id ?? "—"}</span>
          </p>
          <p className="text-muted-foreground">
            DLT templates registered:{" "}
            <span className="font-mono">{templates.length}</span>
          </p>
          {row?.test_ping_at && (
            <p className="text-muted-foreground">
              Last test ping: {new Date(row.test_ping_at).toLocaleString()}
              {row.test_ping_ok
                ? " · ok"
                : ` · failed — ${row.test_ping_message ?? "no detail"}`}
            </p>
          )}
        </CardContent>
      </Card>

      <SmsForm
        currentProvider={(row?.provider as "msg91" | undefined) ?? "msg91"}
        currentSenderId={row?.sender_id ?? ""}
        currentDltEntityId={row?.dlt_entity_id ?? ""}
        currentlyActive={row?.is_active ?? false}
        currentlyConfigured={row?.is_configured ?? false}
        encryptionConfigured={encryptionConfigured}
      />

      <DltTemplatesPanel templates={templates} />
    </div>
  );
}
