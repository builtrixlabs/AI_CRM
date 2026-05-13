export * from "./types";
export * from "./registry";
export { MockEmailProvider } from "./providers/mock";
export {
  ResendEmailProvider,
  resendTestPing,
  type ResendCredentials,
  type ResendConfig,
} from "./providers/resend";
export {
  instantiateEmailAdapter,
  type OrgEmailConfigRow,
} from "./org-config";

import { registerProvider } from "./registry";
import { MockEmailProvider } from "./providers/mock";

registerProvider("mock", () => new MockEmailProvider());
