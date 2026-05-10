import { redirect } from "next/navigation";
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
import { verifyTotpAction, verifyRecoveryAction } from "./actions";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  invalid_code: "That code didn't match. Try again with a fresh 6-digit code.",
  invalid_recovery:
    "That recovery code isn't recognised. Check the format (XXXX-XXXX).",
  recovery_used:
    "That recovery code has already been used. Try a different one.",
  invalid_state:
    "We couldn't read your enrollment. Reach out to your admin to reset MFA.",
};

export default async function MfaVerifyPage(props: {
  searchParams: Promise<{ return?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  const sp = await props.searchParams;
  const returnTo =
    typeof sp.return === "string" && sp.return.startsWith("/")
      ? sp.return
      : "/admin";

  if (!user.profile.mfa_enrolled_at) {
    redirect(`/auth/mfa/setup?return=${encodeURIComponent(returnTo)}`);
  }

  const errorCode = typeof sp.error === "string" ? sp.error : null;
  const errorMessage = errorCode ? ERROR_COPY[errorCode] : null;

  async function submitTotp(formData: FormData): Promise<void> {
    "use server";
    await verifyTotpAction(formData, returnTo);
  }

  async function submitRecovery(formData: FormData): Promise<void> {
    "use server";
    await verifyRecoveryAction(formData, returnTo);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-base">Verify your identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-neutral-700">
            Sensitive admin actions need a fresh MFA stamp (8h window).
            Signed in as{" "}
            <span className="font-mono">{user.user.email}</span>; you&apos;ll
            return to <code className="font-mono">{returnTo}</code>.
          </p>

          {errorMessage && (
            <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {errorMessage}
            </div>
          )}

          <form action={submitTotp} className="space-y-3">
            <div>
              <Label htmlFor="code" className="text-sm font-medium">
                Authenticator code
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
            <Button type="submit">Verify</Button>
          </form>

          <details className="border-t pt-4">
            <summary className="text-sm cursor-pointer text-neutral-700">
              Use a recovery code instead
            </summary>
            <form action={submitRecovery} className="space-y-3 mt-3">
              <div>
                <Label
                  htmlFor="recovery_code"
                  className="text-sm font-medium"
                >
                  Recovery code (XXXX-XXXX)
                </Label>
                <Input
                  id="recovery_code"
                  name="recovery_code"
                  type="text"
                  pattern="[A-Za-z0-9]{4}-[A-Za-z0-9]{4}"
                  maxLength={9}
                  required
                  autoComplete="off"
                  className="font-mono uppercase tracking-wider"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Each recovery code works only once.
                </p>
              </div>
              <Button type="submit" variant="outline">
                Use recovery code
              </Button>
            </form>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
