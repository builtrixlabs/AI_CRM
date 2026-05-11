export * from "./types";
export * from "./registry";
export { MockEmailProvider } from "./providers/mock";

import { registerProvider } from "./registry";
import { MockEmailProvider } from "./providers/mock";

registerProvider("mock", () => new MockEmailProvider());
