"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  bucketsToCsv,
  getKpisOverWindow,
  type AnalyticsBucket,
} from "@/lib/platform/analytics";

const ALLOWED_KPIS = [
  "bookings",
  "qualified_starts",
  "sv_completed",
  "sv_no_show",
] as const;

type Kpi = (typeof ALLOWED_KPIS)[number];

function isKpi(v: unknown): v is Kpi {
  return typeof v === "string" && (ALLOWED_KPIS as readonly string[]).includes(v);
}

function clampDays(raw: number): number {
  if (raw === 60) return 60;
  if (raw === 90) return 90;
  return 30;
}

/**
 * D-312 — return CSV for one KPI over the chosen window. Caller
 * receives a raw string the page wraps into an `<a download>` link.
 *
 * Super-admin only.
 */
export async function exportKpiCsvAction(
  kpi: string,
  days: number
): Promise<{ ok: true; csv: string; filename: string } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (user.profile.base_role !== "super_admin") {
    return { ok: false, error: "permission" };
  }
  if (!isKpi(kpi)) return { ok: false, error: "invalid_kpi" };
  const window = clampDays(days);
  const buckets: AnalyticsBucket[] = await getKpisOverWindow(window);
  return {
    ok: true,
    csv: bucketsToCsv(kpi, buckets),
    filename: `analytics_${kpi}_${window}d.csv`,
  };
}
