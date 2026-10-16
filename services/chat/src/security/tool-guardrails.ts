/**
 * Tool Guardrails
 *
 * Validates tool calls from Claude before executing them. Ensures the model
 * doesn't attempt to call tools it's not allowed to or manipulate other sessions.
 */

// Allowed tools for the standard chat loop
const ALLOWED_TOOLS = ['update_slots','get_session_state'];

export function validateToolCall(
  toolName: string,
  args: Record<string, unknown>,
  currentSessionId: string
): { isAllowed: boolean; reason?: string } {
  // Check if tool is allowed at all
  if (!ALLOWED_TOOLS.includes(toolName)) {
    return { isAllowed: false, reason: `Tool '${toolName}' is not permitted in this context.` };
  }

  // Prevent cross-session manipulation (allowing generic placeholders used by LLMs)
  const PLACEHOLDERS = ["active_session", "new_session", "current_session", "session_id", ""];
  if (args && typeof args.sessionId === "string" && !PLACEHOLDERS.includes(args.sessionId.toLowerCase())) {
    if (args.sessionId !== currentSessionId) {
      return {
        isAllowed: false,
        reason: `Unauthorized: Attempted to call tool on a different session (${args.sessionId}).`,
      };
    }
  }

  return { isAllowed: true };
}
