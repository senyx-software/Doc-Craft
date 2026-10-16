/**
 * Model Router
 *
 * Decides whether to use Claude Haiku (fast, cheap) or Claude Sonnet
 * (more capable) for a given conversation turn.
 *
 * Routing policy:
 *  - If the user set a modelPreference for the session, that is honoured
 *    for all routine turns.
 *  - The router may still escalate to Sonnet for final document generation,
 *    regardless of the user's preference, to ensure output quality.
 *  - Without a preference, Haiku handles ~80 % of turns and Sonnet is used
 *    for long/complex inputs or conversations exceeding the turn threshold.
 */

export type ModelId = "claude-haiku-4-5" | "claude-sonnet-4-5";

export const ALLOWED_MODELS: ModelId[] = ["claude-haiku-4-5", "claude-sonnet-4-5"];

const HAIKU: ModelId = "claude-haiku-4-5";
const SONNET: ModelId = "claude-sonnet-4-5";

/** Capability rank, lowest to highest — used to clamp a routed model down to
 * a plan's admin-configured ceiling without ever upgrading it. */
const MODEL_RANK: Record<ModelId, number> = {
  "claude-haiku-4-5": 0,
  "claude-sonnet-4-5": 1,
};

/** Clamp `model` down to `maxModel` if it exceeds the plan's allowed ceiling. */
export function capModel(model: ModelId, maxModel: ModelId): ModelId {
  return MODEL_RANK[model] > MODEL_RANK[maxModel] ? maxModel : model;
}

/** Turns at which we escalate regardless of message content */
const COMPLEX_TURN_THRESHOLD = 10;

/** Character count above which input is considered complex */
const COMPLEX_MESSAGE_LENGTH = 500;

/** Keywords that signal the user wants the final document generated */
const GENERATION_KEYWORDS = [
  "generate document",
  "create the document",
  "create document",
  "final document",
  "draft the document",
  "write the document",
  "generate the draft",
  "produce the document",
];

/**
 * Returns true if the given string is a valid, supported model ID.
 */
export function isValidModelId(value: string): value is ModelId {
  return ALLOWED_MODELS.includes(value as ModelId);
}

/**
 * Selects the best Claude model for the current conversation turn.
 *
 * @param userMessage      The raw user input for this turn
 * @param messageCount     Total number of messages already in the session
 * @param isCompletionTurn True when all required slots are filled and the AI
 *                         should generate the final document
 * @param preferredModel   Optional model the user has chosen for this session.
 *                         Respected for routine turns; ignored when the router
 *                         must escalate to Sonnet for final generation.
 */
export function selectModel(
  userMessage: string,
  messageCount: number,
  isCompletionTurn: boolean,
  preferredModel?: ModelId | null,
): ModelId {
  // Final document generation always gets Sonnet for quality — this overrides
  // any user preference because document quality is non-negotiable.
  if (isCompletionTurn) return SONNET;

  // If the user has expressed a model preference, honour it for all other turns.
  // We skip the heuristic escalations below since the user made an explicit choice.
  if (preferredModel && ALLOWED_MODELS.includes(preferredModel)) {
    return preferredModel;
  }

  // ── Auto-routing heuristics (used when no preference is set) ───────────────

  // Escalate for long conversations (complexity grows over time)
  if (messageCount > COMPLEX_TURN_THRESHOLD) return SONNET;

  // Escalate for long / complex user inputs
  if (userMessage.length > COMPLEX_MESSAGE_LENGTH) return SONNET;

  // Escalate when user explicitly asks to generate the document
  const lower = userMessage.toLowerCase();
  if (GENERATION_KEYWORDS.some((kw) => lower.includes(kw))) return SONNET;

  // Default: fast, cheap Haiku for routine data collection
  return HAIKU;
}
