export const MAX_AGENT_MESSAGE_LENGTH = 12_000;
export const MAX_AGENT_TOOL_STEPS = 8;
export const MAX_AGENT_TOOL_CALLS = 16;

const SAFE_ERROR_CODES = new Set([
  "MODEL_PROVIDER_NOT_CONFIGURED",
  "MODEL_TIMEOUT",
  "MODEL_RATE_LIMITED",
  "MODEL_REQUEST_FAILED",
  "MODEL_EMPTY_RESPONSE",
  "GOOGLE_NOT_CONNECTED",
  "GOOGLE_RECONNECT_REQUIRED",
  "RATE_LIMIT_CHECK_FAILED",
  "RATE_LIMIT_EXCEEDED",
  "AGENT_RUN_CREATE_FAILED",
  "MESSAGE_SAVE_FAILED",
  "ASSISTANT_MESSAGE_SAVE_FAILED",
  "TOOL_CALL_LIMIT_REACHED",
]);

export function safeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  return SAFE_ERROR_CODES.has(message) ? message : "AGENT_FAILED";
}

export function retryDelayMs(attempt: number, baseMs = 250) {
  const safeAttempt = Math.max(Math.floor(attempt), 1);
  return baseMs * 2 ** (safeAttempt - 1);
}

export function exceedsToolCallLimit(current: number, incoming: number, maximum = MAX_AGENT_TOOL_CALLS) {
  return current + incoming > maximum;
}
