import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isEncryptionConfigured } from "@/lib/comms/encryption";
import { WhatsAppForm } from "./form";
import { ApprovedTemplatesPanel } from "./approved-templates";

export const dynamic = "force-dynamic";

type WhatsAppRedactedRow = {
  organization_id: string;
  provider: "gupshup" | "cloud_api" | null;
  is_configured: boolean;
  from_phone_number_id: string | null;
  from_display_number: string | null;
  approved_templates_count: number | null;
  is_active: boolean;
  test_ping_at: string | null;
  test_ping_ok: boolean | null;
  test_ping_message: string | null;
};

type ApprovedTemplatesRow = {
  approved_template_ids: string[] | null;
};

export default async function WhatsAppConfigPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const supabase = await createSupabaseServerClient();
  const [{ data: rawRow }, { data: rawTemplates }] = await Promise.all([
    supabase
      .from("org_whatsapp_endpoints_redacted")
      .select(
        "organization_id, provider, is_configured, from_phone_number_id, from_display_number, approved_templates_count, is_active, test_ping_at, test_ping_ok, test_ping_message",
      )
      .eq("organization_id", user.org_id)
      .maybeSingle(),
    supabase
      .from("org_whatsapp_endpoints")
      .select("approved_template_ids")
      .eq("organization_id", user.org_id)
      .maybeSingle(),
  ]);

  const row = rawRow as WhatsAppRedactedRow | null;
  const templates = (rawTemplates as ApprovedTemplatesRow | null)
    ?.approved_template_ids ?? [];
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
          <MessageCircle
            className="h-5 w-5"
            style={{ color: "var(--amethyst-700)" }}
          />
          WhatsApp integration
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick Gupshup (BSP) or Meta Cloud API direct, paste your org&apos;s
          credentials, register your pre-approved template IDs. Every send is
          template-gated; non-templated sends are rejected fail-closed.
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
          {row?.provider === "gupshup" && (
            <p className="text-muted-foreground">
              From display number:{" "}
              <span className="font-mono">
                {row?.from_display_number ?? "—"}
              </span>
            </p>
          )}
          {row?.provider === "cloud_api" && (
            <p className="text-muted-foreground">
              From phone-number ID:{" "}
              <span className="font-mono">
                {row?.from_phone_number_id ?? "—"}
              </span>
            </p>
          )}
          <p className="text-muted-foreground">
            Approved templates:{" "}
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

      <WhatsAppForm
        currentProvider={row?.provider ?? "gupshup"}
        currentFromDisplayNumber={row?.from_display_number ?? ""}
        currentFromPhoneNumberId={row?.from_phone_number_id ?? ""}
        currentlyActive={row?.is_active ?? false}
        currentlyConfigured={row?.is_configured ?? false}
        encryptionConfigured={encryptionConfigured}
      />

      <ApprovedTemplatesPanel templates={templates} />
    </div>
  );
}
