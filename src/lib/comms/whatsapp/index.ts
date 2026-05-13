export * from "./types";
export * from "./registry";
export { MockWhatsAppProvider } from "./providers/mock";
export {
  GupshupWhatsAppProvider,
  gupshupTestPing,
  type GupshupCredentials,
  type GupshupConfig,
} from "./providers/gupshup";
export {
  CloudApiWhatsAppProvider,
  cloudApiTestPing,
  type CloudApiCredentials,
  type CloudApiConfig,
} from "./providers/cloud-api";
export {
  instantiateWhatsAppAdapter,
  type OrgWhatsAppEndpointRow,
} from "./org-config";

import { registerProvider } from "./registry";
import { MockWhatsAppProvider } from "./providers/mock";

registerProvider("mock", () => new MockWhatsAppProvider());
