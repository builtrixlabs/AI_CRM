import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { confirmMfaAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function MfaVerifyPage(props: {
  searchParams: Promise<{ return?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  const sp = await props.searchParams;
  const returnTo =
    typeof sp.return === "string" && sp.return.startsWith("/")
      ? sp.return
      : "/admin";

  // Server Action wrapper bound with the returnTo.
  async function confirm(): Promise<void> {
    "use server";
    await confirmMfaAction(returnTo);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-base">Re-verify MFA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-700">
            Sensitive admin actions require a fresh MFA stamp (8h window).
            For V2, click confirm to refresh; real OTP / TOTP delivery
            lands V3.
          </p>
          <p className="text-xs text-neutral-500">
            Signed in as <span className="font-mono">{user.user.email}</span>.
            You&apos;ll return to{" "}
            <code className="font-mono">{returnTo}</code>.
          </p>
          <form action={confirm}>
            <Button type="submit">Confirm I&apos;m me</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
