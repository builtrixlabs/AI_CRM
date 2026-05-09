"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  isTicketStatus,
  replyToTicket,
  setTicketStatus,
} from "@/lib/platform/tickets";

export type TicketActionResult =
  | { ok: true }
  | { ok: false; error: "permission" | "validation" | "internal"; message?: string };

async function gate() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.profile.base_role !== "super_admin") return null;
  return user.user.id;
}

export async function replyAction(
  ticket_id: string,
  body: string
): Promise<TicketActionResult> {
  const actor = await gate();
  if (!actor) return { ok: false, error: "permission" };
  const r = await replyToTicket(ticket_id, body, actor);
  if (!r.ok) {
    return {
      ok: false,
      error: r.error === "body_required" ? "validation" : "internal",
      message: r.error,
    };
  }
  revalidatePath(`/platform/tickets/${ticket_id}`);
  revalidatePath(`/platform/tickets`);
  return { ok: true };
}

export async function setStatusAction(
  ticket_id: string,
  status: string
): Promise<TicketActionResult> {
  const actor = await gate();
  if (!actor) return { ok: false, error: "permission" };
  if (!isTicketStatus(status)) {
    return { ok: false, error: "validation", message: "invalid_status" };
  }
  const r = await setTicketStatus(ticket_id, status, actor);
  if (!r.ok) {
    return {
      ok: false,
      error: r.error === "invalid_status" ? "validation" : "internal",
      message: r.error,
    };
  }
  revalidatePath(`/platform/tickets/${ticket_id}`);
  revalidatePath(`/platform/tickets`);
  return { ok: true };
}
