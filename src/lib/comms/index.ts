// Single import point for the comms layer.
//
// Usage:
//   import { telephony, email, sms } from '@/lib/comms';
//   const provider = telephony.getProvider('mock');

export * as telephony from "./telephony";
export * as email from "./email";
export * as sms from "./sms";
export { CommsError, NoProviderConfigured } from "./types";
export type { ProviderCapabilities, CommsErrorKind } from "./types";
