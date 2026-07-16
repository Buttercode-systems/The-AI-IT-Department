import test from "node:test";
import assert from "node:assert/strict";
import { automationToolAllowed, isMutatingAutomationTool } from "../lib/automation-policy.ts";

test("read-only automations block mutating tools", () => {
  assert.equal(automationToolAllowed("search_gmail", "read_only_only"), true);
  assert.equal(automationToolAllowed("list_calendar_events", "read_only_only"), true);
  assert.equal(automationToolAllowed("create_gmail_draft", "read_only_only"), false);
  assert.equal(automationToolAllowed("propose_send_email", "read_only_only"), false);
});

test("always-ask automations may create approval-backed proposals", () => {
  assert.equal(automationToolAllowed("propose_send_email", "always_ask"), true);
  assert.equal(automationToolAllowed("propose_create_calendar_event", "always_ask"), true);
});

test("mutating tool classification is explicit", () => {
  assert.equal(isMutatingAutomationTool("save_memory"), true);
  assert.equal(isMutatingAutomationTool("search_drive"), false);
});
