/**
 * Output Guardrails
 *
 * Scans AI-generated text for PII or other sensitive information
 * and redacts it before sending it to the user.
 */

// Basic regex for Social Security Numbers (SSN): XXX-XX-XXXX
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

// Basic regex for standard email addresses
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

/**
 * Credit card regex — matches formatted card numbers only (with separators between groups).
 * Patterns recognised:
 *  - Visa/MC/Discover: 4 groups of 4 digits  (e.g. 4111 1111 1111 1111 or 4111-1111-1111-1111)
 *  - Amex: 4-6-5 digit groups                (e.g. 3714 496353 98431)
 *
 * Deliberately does NOT match plain 13–19 digit sequences without separators, because
 * those frequently appear in invoice totals, phone numbers, and serial numbers.
 */
const CREDIT_CARD_REGEX =
  /\b(?:\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}|\d{4}[- ]\d{6}[- ]\d{5})\b/g;

// Strip raw tool-call XML tags that LLMs occasionally leak into text content
const TOOL_CALL_XML_REGEX = /<function\([^)]*\)[^<]*<\/function>|<function_calls>[\s\S]*?<\/function_calls>|<invoke[^>]*>[\s\S]*?<\/invoke>|[a-z0-9_]+>[\s\S]*?<\/function>/gi;

/**
 * Scans an output string and redacts any matching PII patterns (SSN, credit card numbers) and tool call leaks.
 */
export function sanitizeOutputChunk(text: string): string {
  let sanitized = text;

  // Strip tool call XML leaks
  sanitized = sanitized.replace(TOOL_CALL_XML_REGEX, '').trim();

  sanitized = sanitized.replace(SSN_REGEX, "[REDACTED SSN]");
  sanitized = sanitized.replace(CREDIT_CARD_REGEX, "[REDACTED CC]");

  return sanitized;
}
