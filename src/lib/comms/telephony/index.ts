export * from "./types";
export * from "./registry";
export { MockTelephonyProvider } from "./providers/mock";

import { registerProvider } from "./registry";
import { MockTelephonyProvider } from "./providers/mock";

// Self-register the mock so any test that imports the telephony module sees
// it. Live providers are registered by their own setup directives.
registerProvider("mock", () => new MockTelephonyProvider());
