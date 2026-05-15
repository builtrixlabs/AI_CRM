import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { FeedbackForm } from "@/components/feedback/feedback-form";

export const dynamic = "force-dynamic";

/** D-617 — the real destination for the Cmd+K "Send feedback" shortcut. */
export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <header>
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="feedback-title"
        >
          Send feedback
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us what&apos;s working, what&apos;s broken, or what you&apos;d
          like to see next. Your feedback is logged for the Builtrix team.
        </p>
      </header>
      <div className="mt-6">
        <FeedbackForm />
      </div>
    </main>
  );
}
