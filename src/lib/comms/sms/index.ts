export * from "./types";
export * from "./registry";
export { MockSmsProvider } from "./providers/mock";
export {
  Msg91SmsProvider,
  msg91TestPing,
  type Msg91Credentials,
  type Msg91Config,
} from "./providers/msg91";
export {
  instantiateSmsAdapter,
  type OrgSmsConfigRow,
} from "./org-config";

import { registerProvider } from "./registry";
import { MockSmsProvider } from "./providers/mock";

registerProvider("mock", () => new MockSmsProvider());
