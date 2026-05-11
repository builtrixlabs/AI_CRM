export * from "./types";
export * from "./registry";
export { MockSmsProvider } from "./providers/mock";

import { registerProvider } from "./registry";
import { MockSmsProvider } from "./providers/mock";

registerProvider("mock", () => new MockSmsProvider());
