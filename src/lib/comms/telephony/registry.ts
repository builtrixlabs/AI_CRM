import { CommsError } from "../types";
import type { TelephonyAdapter, TelephonyProviderId } from "./types";

type Factory = () => TelephonyAdapter;
const registry = new Map<TelephonyProviderId, Factory>();

export function registerProvider(
  id: TelephonyProviderId,
  factory: Factory,
): void {
  registry.set(id, factory);
}

export function getProvider(id: TelephonyProviderId): TelephonyAdapter {
  const f = registry.get(id);
  if (!f) {
    throw new CommsError(
      `Unknown telephony provider: ${id}`,
      "not_configured",
    );
  }
  return f();
}

export function listProviders(): TelephonyProviderId[] {
  return Array.from(registry.keys());
}

/** Test seam — only used by tests. */
export function _resetRegistry(): void {
  registry.clear();
}
