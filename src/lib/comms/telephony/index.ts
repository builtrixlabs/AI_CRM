export * from "./types";
export * from "./registry";
export { MockTelephonyProvider } from "./providers/mock";
export {
  ExotelTelephonyProvider,
  exotelTestPing,
  type ExotelCredentials,
  type ExotelConfig,
} from "./providers/exotel";
export {
  instantiateTelephonyAdapter,
  type OrgTelephonyConfigRow,
} from "./org-config";

import { registerProvider } from "./registry";
import { MockTelephonyProvider } from "./providers/mock";

// Self-register the mock so any test that imports the telephony module sees
// it. Exotel is constructed per-org via instantiateTelephonyAdapter — the
// factory-based registry has no place to inject org-specific credentials.
registerProvider("mock", () => new MockTelephonyProvider());
