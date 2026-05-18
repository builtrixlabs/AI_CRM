import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Phone } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isEncryptionConfigured } from "@/lib/comms/encryption";
import { TelephonyForm } from "./form";

export const dynamic = "force-dynamic";

type TelephonyRedactedRow = {
  organization_id: string;
  provider: string;
  is_configured: boolean;
  virtual_number: string | null;
  is_active: boolean;
  test_ping_at: string | null;
  test_ping_ok: boolean | null;
  test_ping_message: string | null;
};

export default async function TelephonyConfigPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  // Read from the redacted view — never round-trips encrypted credentials
  // to the server bundle. RLS scopes by app_org_id().
  const supabase = await createSupabaseServerClient();
  const { data: row } = (await supabase
    .from("org_telephony_config_redacted")
    .select(
      "organization_id, provider, is_configured, virtual_number, is_active, test_ping_at, test_ping_ok, test_ping_message",
    )
    .eq("organization_id", user.org_id)
    .maybeSingle()) as { data: TelephonyRedactedRow | null };

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
          <Phone className="h-5 w-5" style={{ color: "var(--amethyst-700)" }} />
          Telephony integration
        </h1>
        <p className="text-sm text-muted-foreground">
          Plug in your organization&apos;s Exotel credentials to enable
          click-to-call from lead canvases and capture inbound calls into the
          activity stream. Credentials are AES-256-GCM encrypted at rest;
          ciphertext never round-trips to the browser.
        </p>
      </div>

      {!encryptionConfigured && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm">
            <strong>Server not provisioned for integration encryption.</strong>{" "}
            The operator must set{" "}
            <code className="font-mono">INTEGRATION_ENCRYPTION_KEY</code> in the
            runtime environment before credentials can be saved. Generate with{" "}
            <code className="font-mono">openssl rand -hex 32</code>.
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
            Virtual number:{" "}
            <span className="font-mono">{row?.virtual_number ?? "—"}</span>
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

      <TelephonyForm
        currentProvider={(row?.provider as "exotel" | undefined) ?? "exotel"}
        currentVirtualNumber={row?.virtual_number ?? ""}
        currentlyActive={row?.is_active ?? false}
        currentlyConfigured={row?.is_configured ?? false}
        encryptionConfigured={encryptionConfigured}
      />
    </div>
  );
}
