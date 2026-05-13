import { CommsError } from "../types";
import type { WhatsAppAdapter, WhatsAppProviderId } from "./types";

type Factory = () => WhatsAppAdapter;
const registry = new Map<WhatsAppProviderId, Factory>();

export function registerProvider(
  id: WhatsAppProviderId,
  factory: Factory,
): void {
  registry.set(id, factory);
}

export function getProvider(id: WhatsAppProviderId): WhatsAppAdapter {
  const f = registry.get(id);
  if (!f) {
    throw new CommsError(
      `Unknown whatsapp provider: ${id}`,
      "not_configured",
    );
  }
  return f();
}

export function listProviders(): WhatsAppProviderId[] {
  return Array.from(registry.keys());
}

export function _resetRegistry(): void {
  registry.clear();
}
