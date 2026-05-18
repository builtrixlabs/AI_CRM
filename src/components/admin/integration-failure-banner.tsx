import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

type Channel = "email" | "telephony" | "sms" | "whatsapp";

type Props = {
  channel: Channel;
  count: number;
  configureHref?: string;
};

const CHANNEL_COPY: Record<
  Channel,
  { label: string; reminderNoun: string; defaultHref: string }
> = {
  email: {
    label: "email",
    reminderNoun: "reminder",
    defaultHref: "/admin/integrations/email",
  },
  telephony: {
    label: "telephony",
    reminderNoun: "callback",
    defaultHref: "/admin/integrations/telephony",
  },
  sms: {
    label: "SMS",
    reminderNoun: "reminder",
    defaultHref: "/admin/integrations/sms",
  },
  whatsapp: {
    label: "WhatsApp",
    reminderNoun: "follow-up",
    defaultHref: "/admin/integrations/whatsapp",
  },
};

/**
 * D-501 port of PSCRM's integration-failure surface. Renders an amber
 * banner on /admin when a known number of queued jobs failed because
 * the channel isn't configured for the org. Hides when count <= 0.
 *
 * The count source is intentionally generic — V5's failed_jobs feed
 * lands with D-433+ and pipes per-channel unconfigured counters in.
 * Until then, callers pass 0 and the banner self-hides.
 */
export function IntegrationFailureBanner({
  channel,
  count,
  configureHref,
}: Props) {
  if (count <= 0) return null;
  const copy = CHANNEL_COPY[channel];
  const href = configureHref ?? copy.defaultHref;
  return (
    <Card
      className="border bg-secondary/30"
      style={{ borderColor: "var(--copper-300)" }}
    >
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 flex-none"
            style={{ color: "var(--copper-700)" }}
          />
          <div className="space-y-1">
            <div className="text-sm font-semibold">
              {copy.label.charAt(0).toUpperCase() + copy.label.slice(1)}{" "}
              {copy.reminderNoun}s are not being delivered
            </div>
            <div className="text-xs text-muted-foreground">
              {count.toLocaleString()} {copy.reminderNoun}
              {count === 1 ? "" : "s"} could not be queued because no default{" "}
              {copy.label} integration is configured. Customers will stop
              receiving {copy.reminderNoun}s until this is fixed.
            </div>
          </div>
        </div>
        <Link href={href} className={buttonVariants({ size: "sm" })}>
          Configure {copy.label}
          <ArrowRight className="ml-1 h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}
