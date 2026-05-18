import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { redirect } from "next/navigation";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

export default async function CpSubmitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  if (user.profile.base_role !== "channel_partner") {
    return (
      <div className="space-y-3 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">
          Channel Partner submit
        </h1>
        <Card>
          <CardContent className="py-6 text-sm text-neutral-600">
            You&apos;re signed in as <strong>{user.profile.base_role}</strong>.
            This surface is for channel partners — your role lands on{" "}
            <code className="font-mono">/admin</code> or{" "}
            <code className="font-mono">/dashboard</code> instead. Switch to a
            channel-partner login to submit a lead.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Submit a lead
        </h1>
        <p className="text-sm text-neutral-600">
          Lands as a new lead in your partner org&apos;s CRM. The CP coordinator
          is auto-notified.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead details</CardTitle>
        </CardHeader>
        <CardContent>
          <SubmitForm />
        </CardContent>
      </Card>
    </div>
  );
}
