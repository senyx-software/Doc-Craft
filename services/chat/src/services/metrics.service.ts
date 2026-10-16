import client from "prom-client";

// Global Registry — isolated from the default prom-client global registry
export const registry = new client.Registry();

// Enable default metrics (CPU, memory, etc.) on our isolated registry
client.collectDefaultMetrics({ register: registry });

// Custom metrics for the chat service.
// Each metric passes `registers: [registry]` so it auto-registers ONLY to our
// isolated registry (not the global one), preventing "already registered" errors.

export const activeRequestsGauge = new client.Gauge({
  name: "doccraft_active_requests",
  help: "Number of active concurrent Claude requests",
  registers: [registry],
});

export const queueSizeGauge = new client.Gauge({
  name: "doccraft_queue_size",
  help: "Number of requests waiting in the queue",
  registers: [registry],
});

export const claudeResponseTimeSummary = new client.Summary({
  name: "doccraft_claude_response_time_ms",
  help: "Time taken for a complete Claude response",
  percentiles: [0.5, 0.9, 0.99],
  registers: [registry],
});

export const requestWaitTimeSummary = new client.Summary({
  name: "doccraft_request_wait_time_ms",
  help: "Time spent waiting in the queue before execution",
  percentiles: [0.5, 0.9, 0.99],
  registers: [registry],
});

export const rejectedRequestsCounter = new client.Counter({
  name: "doccraft_rejected_requests_total",
  help: "Total number of rejected requests (e.g. queue full, rate limit)",
  labelNames: ["reason"],
  registers: [registry],
});

export const chatTurnsCounter=new client.Counter({name:'doccraft_chat_turns_total',help:'Chat terminal outcomes',labelNames:['outcome'],registers:[registry]});
export const contextRetrievalCounter=new client.Counter({name:'doccraft_context_retrieval_total',help:'Authorized context retrieval outcomes',labelNames:['outcome'],registers:[registry]});

export const conversationIntentCounter=new client.Counter({name:"doccraft_conversation_intents_total",help:"Intent decisions and operation outcomes",labelNames:["intent","outcome"],registers:[registry]});
export const responseDecisionCounter=new client.Counter({name:'doccraft_chat_response_decisions_total',help:'Authoritative response source selection',labelNames:['decision'],registers:[registry]});
export const chatFailurePhaseCounter=new client.Counter({name:'doccraft_chat_failure_phases_total',help:'Categorized failure phase and recovery policy',labelNames:['phase','retryable'],registers:[registry]});
