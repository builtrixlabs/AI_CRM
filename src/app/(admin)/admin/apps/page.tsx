import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Sparkles, Mic, Scale, Boxes, Megaphone } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { AppAccessCard, type AppEntry } from "@/components/admin/app-access-card";

export const dynamic = "force-dynamic";

const APPS: AppEntry[] = [
  {
    slug: "crm",
    name: "AI CRM",
    description:
      "Lead-to-booking pipeline · AI orchestration · telephony / email / SMS / WhatsApp comms. This product.",
    status: "active",
    Icon: Sparkles,
    href: "/dashboard",
  },
  {
    slug: "voice_iq",
    name: "Voice IQ",
    description:
      "Call audit + BANT scoring for every inbound and outbound conversation. Webhook-integrated.",
    status: "active",
    Icon: Mic,
    href: "/admin/integrations/voice-iq",
  },
  {
    slug: "mih",
    name: "Marketing Intelligence Hub",
    description:
      "Source ingestion + dedup + curation for every lead a builder's marketing spend produces; pushes curated leads into the CRM. Sister product — connects via D-604 (V6 Phase 1).",
    status: "coming_soon",
    Icon: Megaphone,
  },
  {
    slug: "pscrm",
    name: "Post-Sales CRM",
    description:
      "Bookings, demand letters, possession, registration, defects — for the post-booking life-cycle. Sister product.",
    status: "coming_soon",
    Icon: Boxes,
  },
  {
    slug: "legal_auditor",
    name: "Legal Auditor",
    description:
      "Real-estate document auditing + compliance flagging. Sister product.",
    status: "coming_soon",
    Icon: Scale,
  },
];

export default async function AppsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to admin
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">App access</h1>
        <p className="text-sm text-muted-foreground">
          Apps your organization is subscribed to. Cross-app entitlements
          are managed by Builtrix; more products appear here as they come
          online.
        </p>
      </div>
      <AppAccessCard apps={APPS} />
    </div>
  );
}
