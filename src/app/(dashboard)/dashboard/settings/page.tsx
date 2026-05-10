import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ProfileForm } from "@/components/auth/profile-form";
import { updateOwnProfileAction } from "@/lib/auth/profileActions";

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-sm text-neutral-600">
          Display name, phone, theme, and notification preferences. Saved
          changes are audited.
        </p>
      </header>

      <ProfileForm
        email={user.user.email}
        display_name={user.profile.display_name}
        phone={user.profile.phone ?? null}
        theme={user.profile.theme ?? "system"}
        notification_prefs={user.profile.notification_prefs ?? {}}
        action={updateOwnProfileAction}
      />
    </div>
  );
}
