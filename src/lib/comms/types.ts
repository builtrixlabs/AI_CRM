// Shared types across telephony / email / SMS adapters. See
// docs/baselines/116-comms-providers-contract.md for the canonical contract.

export type ProviderCapabilities = {
  inbound: boolean;
  delivery_receipts: boolean;
  templates_required: boolean;
};

export type CommsErrorKind =
  | "invalid_args"
  | "provider_unavailable"
  | "unauthorized"
  | "template_not_found"
  | "rate_limited"
  | "not_configured";

export class CommsError extends Error {
  constructor(
    message: string,
    public readonly kind: CommsErrorKind,
  ) {
    super(message);
    this.name = "CommsError";
  }
}

/**
 * NoProviderConfigured is the specific CommsError that callers MUST treat as
 * "comms not sent + warning" rather than a hard failure (PRD §3 P2).
 */
export class NoProviderConfigured extends CommsError {
  constructor(channel: string, org_id: string) {
    super(
      `No provider configured for channel '${channel}' on org ${org_id}`,
      "not_configured",
    );
    this.name = "NoProviderConfigured";
  }
}
