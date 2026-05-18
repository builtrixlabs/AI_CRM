import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Phone,
  Mail,
  MessageSquare,
  MessageCircle,
  Mic,
  type LucideIcon,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import {
  getIntegrationsHealth,
  type ChannelHealth,
  type ChannelId,
} from "@/lib/integrations/health";
import { IntegrationHealthBadge } from "@/components/admin/integration-health-badge";

export const dynamic = "force-dynamic";

type Channel = {
  slug: ChannelId;
  name: string;
  description: string;
  href: string;
  Icon: LucideIcon;
};

const CHANNELS: Channel[] = [
  {
    slug: "telephony",
    name: "Telephony",
    description:
      "Click-to-call and inbound call capture. Plug in your org's Exotel, Servetel, Knowlarity, MyOperator, or Ozonetel credentials.",
    href: "/admin/integrations/telephony",
    Icon: Phone,
  },
  {
    slug: "email",
    name: "Email",
    description:
      "Transactional + follow-up email. Resend (recommended) or Postmark — your sender, your domain.",
    href: "/admin/integrations/email",
    Icon: Mail,
  },
  {
    slug: "sms",
    name: "SMS",
    description:
      "DLT-compliant SMS via MSG91 or Gupshup with org-managed template registry.",
    href: "/admin/integrations/sms",
    Icon: MessageSquare,
  },
  {
    slug: "whatsapp",
    name: "WhatsApp",
    description:
      "Conversational outbound + inbound via Gupshup BSP or Meta Cloud API. Approved templates per org.",
    href: "/admin/integrations/whatsapp",
    Icon: MessageCircle,
  },
  {
    slug: "voice_iq",
    name: "Voice IQ",
    description:
      "BANT-scored call audit webhook from the Voice IQ sister product.",
    href: "/admin/integrations/voice-iq",
    Icon: Mic,
  },
];

export default async function IntegrationsIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  if (!user.org_id) redirect("/dashboard");

  const health = await getIntegrationsHealth(user.org_id);
  const healthBySlug = new Map<ChannelId, ChannelHealth>(
    health.map((h) => [h.channel, h]),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Plug in your organization&apos;s own provider credentials for each
          communication channel. Every org configures providers
          independently — Builtrix never holds shared credentials.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {CHANNELS.map((c) => (
          <ChannelTile
            key={c.slug}
            channel={c}
            health={
              healthBySlug.get(c.slug) ?? {
                channel: c.slug,
                status: "unavailable",
                detail: "",
                last_check_at: null,
              }
            }
          />
        ))}
      </div>
    </div>
  );
}

function ChannelTile({
  channel,
  health,
}: {
  channel: Channel;
  health: ChannelHealth;
}) {
  const Icon = channel.Icon;
  const dim = health.status === "unavailable";
  const inner = (
    <div
      className={[
        "rounded-xl border p-5 transition-colors",
        dim
          ? "border-dashed opacity-60"
          : "hover:border-[color:var(--amethyst-500)]/60",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3 pb-3">
        <div className="flex items-center gap-2 font-semibold">
          <Icon className="h-5 w-5" style={{ color: "var(--amethyst-700)" }} />
          {channel.name}
        </div>
        <IntegrationHealthBadge
          status={health.status}
          detail={health.detail}
        />
      </div>
      <p className="text-sm text-muted-foreground">{channel.description}</p>
      {health.last_check_at && (
        <p className="mt-2 text-[11px] text-muted-foreground/80">
          Last check: {new Date(health.last_check_at).toLocaleString()}
        </p>
      )}
    </div>
  );
  if (dim) return inner;
  return (
    <Link href={channel.href} aria-label={channel.name}>
      {inner}
    </Link>
  );
}
