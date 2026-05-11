import { CommsError } from "../types";
import type { SmsAdapter, SmsProviderId } from "./types";

type Factory = () => SmsAdapter;
const registry = new Map<SmsProviderId, Factory>();

export function registerProvider(id: SmsProviderId, factory: Factory): void {
  registry.set(id, factory);
}

export function getProvider(id: SmsProviderId): SmsAdapter {
  const f = registry.get(id);
  if (!f) {
    throw new CommsError(`Unknown SMS provider: ${id}`, "not_configured");
  }
  return f();
}

export function listProviders(): SmsProviderId[] {
  return Array.from(registry.keys());
}

export function _resetRegistry(): void {
  registry.clear();
}
