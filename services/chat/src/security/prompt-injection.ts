/**
 * Prompt Injection Detection
 *
 * Scans user messages for common prompt injection patterns before they reach
 * Claude. Flagged messages are stored in the DB but Claude is never called.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(previous|prior|all)\s+instructions?/i,
  /disregard\s+(your|the)\s+(system\s+prompt|instructions?|rules?)/i,
  /you\s+are\s+now\s+(?!doccraft)/i,
  /act\s+as\s+(?!a\s+(helpful|professional|document))/i,
  /\bjailbreak\b/i,
  /\bDAN\s+(?:mode|jailbreak|persona)\b/i,
  /pretend\s+(?:you\s+are|to\s+be)/i,
  /forget\s+(?:everything|all)\s+(?:you\s+know|previous|prior)/i,
  /your\s+(?:new\s+)?(?:system\s+)?instructions?\s+are/i,
  /new\s+persona/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  /<\|im_start\|>/,
  /<\|system\|>/,
  /\/\/\s*override/i,
  /do\s+anything\s+now/i,
  /developer\s+mode/i,
];

// Zero-width and invisible Unicode characters often used to hide injections
const INVISIBLE_CHARS_RE = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;

/**
 * Returns true if the message contains a suspected prompt injection attempt.
 */
export function detectPromptInjection(message: string): boolean {
  // Pattern-based detection
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(message.replace(INVISIBLE_CHARS_RE, '')))) {
    return true;
  }

  // Invisible / zero-width character detection
  // Invisible characters alone occur in pasted addresses. Strip them when checking
  // instruction overrides instead of rejecting all pasted document data.

  // Base64-encoded injection detection (checks if decoded text matches patterns)
  const base64RE = /[A-Za-z0-9+/]{40,}={0,2}/g;
  const candidates = message.match(base64RE) ?? [];
  for (const candidate of candidates) {
    try {
      const decoded = Buffer.from(candidate, "base64").toString("utf-8");
      if (INJECTION_PATTERNS.some((p) => p.test(decoded))) {
        return true;
      }
    } catch {
      // Not valid base64 — skip
    }
  }

  return false;
}
