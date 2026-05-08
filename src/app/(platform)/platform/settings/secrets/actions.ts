"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { invalidateSecretCache } from "@/lib/secrets/getSecret";
import { upsertSecret } from "@/lib/secrets/queries";
import { SECRET_KINDS, type SecretKind } from "@/lib/secrets/types";

export type SetSecretResult =
  | { ok: true }
  | { ok: false; error: "permission" | "validation"; message?: string };

function isSecretKind(value: unknown): value is SecretKind {
  return (
    typeof value === "string" &&
    (SECRET_KINDS as readonly string[]).includes(value)
  );
}

export async function setSecretAction(
  formData: FormData
): Promise<SetSecretResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "permission" };
  if (user.profile.base_role !== "super_admin") {
    return { ok: false, error: "permission" };
  }

  const kindRaw = formData.get("kind");
  const valueRaw = formData.get("value");
  if (!isSecretKind(kindRaw)) {
    return { ok: false, error: "validation", message: "unknown secret kind" };
  }
  if (typeof valueRaw !== "string" || valueRaw.trim().length < 8) {
    return {
      ok: false,
      error: "validation",
      message: "value must be at least 8 characters",
    };
  }

  await upsertSecret({
    kind: kindRaw,
    value: valueRaw.trim(),
    actor_id: user.user.id,
  });
  invalidateSecretCache(kindRaw);
  revalidatePath("/platform/settings/secrets");
  return { ok: true };
}
