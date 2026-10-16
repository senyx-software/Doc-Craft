/**
 * Input Guardrails
 *
 * Validates user input beyond just prompt injection detection.
 * Checks for excessive length or spammy patterns.
 */

export function validateInputGuardrails(message: string): { isValid: boolean; reason?: string } {
  // Check for excessively long messages (though Zod also checks this, this is an extra layer)
  if (message.length > 4000) {
    return { isValid: false, reason: "Message exceeds maximum allowed length." };
  }

  // Check for repetitive spam (e.g., user just typing "aaaaaaa" for 50+ characters)
  const repetitivePattern = /(.)\1{49,}/;
  if (repetitivePattern.test(message)) {
    return { isValid: false, reason: "Message contains excessive repetitive characters." };
  }

  // Check for an empty or purely whitespace message
  if (message.trim().length === 0) {
    return { isValid: false, reason: "Message cannot be empty." };
  }

  return { isValid: true };
}
