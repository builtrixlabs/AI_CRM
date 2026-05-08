export {
  AGENT_TIERS,
  type AgentTier,
  type CompleteInput,
  type CompleteResult,
  type CompleteOk,
  type EmbedInput,
  type EmbedResult,
  type EmbedOk,
  type GatewayErr,
  type GatewayErrorCode,
  type GatewayCallContext,
  type GatewayWarning,
} from "./types";

export {
  MONTHLY_TOKEN_CAP,
  SOFT_WARN_RATIO,
  TokenBudgetExceededError,
  checkBudget,
  currentMonthTokens,
  type BudgetCheck,
} from "./budget";

export {
  recordCall,
  type LedgerCallKind,
  type LedgerStatus,
  type RecordCallInput,
} from "./ledger";

export { complete, embed, type GatewayDeps } from "./gateway";
