import CircuitBreaker from "opossum";
import Anthropic from "@anthropic-ai/sdk";

// Define the async function that the circuit breaker will execute
async function anthropicStreamCall(
  client: Anthropic,
  params: Anthropic.MessageStreamParams,
  options: { signal?: AbortSignal }
) {
  return client.messages.stream(params, options);
}

const breakerOptions = {
  timeout: false as const, // We'll handle timeout explicitly with AbortSignal in the caller
  errorThresholdPercentage: 50, // Open circuit when 50% of requests fail
  resetTimeout: 10000, // Try to close the circuit after 10 seconds
  volumeThreshold: 10, // Minimum 10 requests before evaluating error rate
};

export const anthropicCircuitBreaker = new CircuitBreaker(anthropicStreamCall, breakerOptions);

anthropicCircuitBreaker.on("open", () => console.error("🚨 Anthropic Circuit Breaker is OPEN!"));
anthropicCircuitBreaker.on("halfOpen", () => console.warn("⚠️ Anthropic Circuit Breaker is HALF-OPEN"));
anthropicCircuitBreaker.on("close", () => console.log("✅ Anthropic Circuit Breaker is CLOSED"));
