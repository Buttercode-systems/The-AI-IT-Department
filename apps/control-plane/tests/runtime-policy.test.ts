import test from "node:test";
import assert from "node:assert/strict";
import { exceedsToolCallLimit, retryDelayMs, safeErrorCode } from "../lib/runtime-policy.ts";

test("safeErrorCode preserves approved operational errors", () => {
  assert.equal(safeErrorCode(new Error("MODEL_TIMEOUT")), "MODEL_TIMEOUT");
  assert.equal(safeErrorCode(new Error("GOOGLE_RECONNECT_REQUIRED")), "GOOGLE_RECONNECT_REQUIRED");
});

test("safeErrorCode hides unexpected provider and database details", () => {
  assert.equal(safeErrorCode(new Error("relation secret_table does not exist")), "AGENT_FAILED");
  assert.equal(safeErrorCode("raw failure"), "AGENT_FAILED");
});

test("retryDelayMs uses bounded exponential progression", () => {
  assert.equal(retryDelayMs(1), 250);
  assert.equal(retryDelayMs(2), 500);
  assert.equal(retryDelayMs(3), 1000);
  assert.equal(retryDelayMs(0), 250);
});

test("tool call limit rejects only requests above the maximum", () => {
  assert.equal(exceedsToolCallLimit(8, 8, 16), false);
  assert.equal(exceedsToolCallLimit(8, 9, 16), true);
});
