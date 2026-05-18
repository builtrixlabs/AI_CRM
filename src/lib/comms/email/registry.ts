import { CommsError } from "../types";
import type { EmailAdapter, EmailProviderId } from "./types";

type Factory = () => EmailAdapter;
const registry = new Map<EmailProviderId, Factory>();

export function registerProvider(id: EmailProviderId, factory: Factory): void {
  registry.set(id, factory);
}

export function getProvider(id: EmailProviderId): EmailAdapter {
  const f = registry.get(id);
  if (!f) {
    throw new CommsError(`Unknown email provider: ${id}`, "not_configured");
  }
  return f();
}

export function listProviders(): EmailProviderId[] {
  return Array.from(registry.keys());
}

export function _resetRegistry(): void {
  registry.clear();
}
