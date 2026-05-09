import Link from "next/link";

export type MfaBannerProps = {
  verified_at: string | null;
  fresh: boolean;
  demo_bypass: boolean;
  return_to: string;
};

/**
 * Amber advisory bar at the top of sensitive pages when MFA is stale.
 * Hidden when demo bypass is active. v2 ships advisory only — hard
 * redirect lands V3 alongside real OTP delivery.
 */
export function MfaFreshnessBanner(props: MfaBannerProps) {
  if (props.demo_bypass) return null;
  if (props.fresh) return null;
  const last = props.verified_at
    ? new Date(props.verified_at).toLocaleString()
    : "never";
  const href = `/auth/mfa?return=${encodeURIComponent(props.return_to)}`;
  return (
    <div
      className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-sm flex items-center justify-between gap-4"
      role="status"
      aria-label="MFA freshness advisory"
    >
      <span>
        <strong>MFA stale.</strong> Last verified {last}. Sensitive actions
        will require re-verify in V3.
      </span>
      <Link
        href={href}
        className="rounded-md bg-amber-900 text-amber-50 text-xs px-3 py-1.5"
      >
        Re-verify
      </Link>
    </div>
  );
}
