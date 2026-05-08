export {
  LEAD_STATES,
  type LeadState,
} from "./types";

export {
  TRANSITIONS,
  TERMINAL_STATES,
  allowedTransitions,
  isTerminal,
  assertTransitionAllowed,
  IllegalTransitionError,
} from "./transitions";

export {
  createLeadInputSchema,
  updateLeadInputSchema,
  transitionInputSchema,
  type CreateLeadInput,
  type UpdateLeadInput,
  type TransitionInput,
} from "./schemas";

export {
  createLead,
  transitionLead,
  type CreateLeadArgs,
  type TransitionLeadArgs,
} from "./api";
