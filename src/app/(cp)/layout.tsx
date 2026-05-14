import { redirect } from "next/navigation";

/**
 * D-221 Channel Partner portal — DORMANT in V6 (implementation-order §5.4).
 *
 * Every `/cp/*` route is unmounted: this layout redirects all requests to
 * sign-in before any child page renders. The route files under
 * `src/app/(cp)/cp/`, the `src/lib/cp/` module, the `channel_partner`
 * base_role, and the CP DB tables are all retained for the revival path —
 * restore this file from git history to re-mount the portal.
 */
export default function CpLayout() {
  redirect("/auth/sign-in");
}
