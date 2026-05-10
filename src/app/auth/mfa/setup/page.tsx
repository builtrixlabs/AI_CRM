import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { generateCodes, hashCodes } from "@/lib/auth/recovery-codes";
import {
  buildOtpauthUrl,
  decryptSecret,
  encryptSecret,
  generateSecret,
  type MfaSecretPayload,
} from "@/lib/auth/totp";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { confirmEnrollmentAction } from "./actions";

export const dynamic = "force-dynamic";

const ISSUER = "Builtrix CRM";

export default async function MfaSetupPage(props: {
  searchParams: Promise<{ return?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.mfa_enrolled_at) redirect("/auth/mfa");

  const sp = await props.searchParams;
  const returnTo =
    typeof sp.return === "string" && sp.return.startsWith("/")
      ? sp.return
      : "/admin";
  const errorCode = typeof sp.error === "string" ? sp.error : null;

  const admin = getSupabaseAdmin();

  const { data: existing } = await admin
    .from("profiles")
    .select("mfa_secret")
    .eq("id", user.user.id)
    .maybeSingle();

  let secret_b32: string;
  let plaintextCodes: string[] | null;

  if (existing?.mfa_secret) {
    try {
      secret_b32 = decryptSecret(existing.mfa_secret as MfaSecretPayload);
    } catch {
      const fresh = generateSecret();
      secret_b32 = fresh.secret_b32;
      plaintextCodes = generateCodes(10);
      await admin
        .from("profiles")
        .update({
          mfa_secret: encryptSecret(secret_b32),
          mfa_recovery_codes: await hashCodes(plaintextCodes),
        })
        .eq("id", user.user.id);
      return renderPage({
        email: user.user.email,
        returnTo,
        secret_b32,
        plaintextCodes,
        errorCode,
      });
    }
    plaintextCodes = null;
  } else {
    const fresh = generateSecret();
    secret_b32 = fresh.secret_b32;
    plaintextCodes = generateCodes(10);
    await admin
      .from("profiles")
      .update({
        mfa_secret: encryptSecret(secret_b32),
        mfa_recovery_codes: await hashCodes(plaintextCodes),
      })
      .eq("id", user.user.id);
  }

  return renderPage({
    email: user.user.email,
    returnTo,
    secret_b32,
    plaintextCodes,
    errorCode,
  });
}

async function renderPage(opts: {
  email: string;
  returnTo: string;
  secret_b32: string;
  plaintextCodes: string[] | null;
  errorCode: string | null;
}) {
  const otpurl = buildOtpauthUrl(opts.secret_b32, opts.email, ISSUER);
  const qr_dataurl = await QRCode.toDataURL(otpurl);

  async function confirm(formData: FormData): Promise<void> {
    "use server";
    await confirmEnrollmentAction(formData, opts.returnTo);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle>Set up two-factor authentication</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {opts.errorCode === "invalid_code" && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              That code didn&apos;t match. Try again with a fresh 6-digit code
              from your authenticator app.
            </div>
          )}
          {opts.errorCode === "invalid_state" && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              We couldn&apos;t read your pending setup. We&apos;ve generated a new
              secret — please scan the QR below and try again.
            </div>
          )}

          <section>
            <h2 className="text-sm font-medium mb-2">
              1. Scan with your authenticator app
            </h2>
            <img
              src={qr_dataurl}
              alt="MFA QR code"
              className="w-56 h-56 border"
            />
            <p className="text-xs text-neutral-500 mt-2">
              Manual entry secret:{" "}
              <code className="font-mono">{opts.secret_b32}</code>
            </p>
          </section>

          {opts.plaintextCodes && (
            <section>
              <h2 className="text-sm font-medium mb-2">
                2. Save your recovery codes
              </h2>
              <p className="text-xs text-neutral-500 mb-2">
                Each code works once. Save these somewhere safe — you won&apos;t
                see them again.{" "}
                <strong>
                  Refreshing this page generates new codes and invalidates the
                  ones above.
                </strong>
              </p>
              <ul
                className="grid grid-cols-2 gap-2 font-mono text-sm"
                data-testid="recovery-codes"
              >
                {opts.plaintextCodes.map((c) => (
                  <li
                    key={c}
                    className="border rounded px-3 py-1.5 bg-neutral-50"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!opts.plaintextCodes && (
            <section>
              <h2 className="text-sm font-medium mb-2">
                2. Recovery codes already saved
              </h2>
              <p className="text-xs text-neutral-500">
                You&apos;ve already started enrollment. The recovery codes you
                downloaded earlier are still valid. Scan the QR above with your
                authenticator and enter the code below to finish.
              </p>
            </section>
          )}

          <form action={confirm} className="space-y-3">
            <div>
              <Label htmlFor="code" className="text-sm font-medium">
                3. Enter the 6-digit code
              </Label>
              <Input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                autoComplete="one-time-code"
                className="font-mono text-lg tracking-widest"
              />
            </div>
            <Button type="submit">Confirm enrollment</Button>
          </form>

          <p className="text-xs text-neutral-500">
            You&apos;ll return to{" "}
            <code className="font-mono">{opts.returnTo}</code> after enrollment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
