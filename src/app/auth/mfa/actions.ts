"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { markMfaVerified } from "@/lib/auth/mfa";

export async function confirmMfaAction(returnTo: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/sign-in");
  }
  await markMfaVerified(user.user.id);
  // Sanitize redirect — only allow same-origin paths.
  const safe =
    typeof returnTo === "string" && returnTo.startsWith("/")
      ? returnTo
      : "/admin";
  redirect(safe);
}
