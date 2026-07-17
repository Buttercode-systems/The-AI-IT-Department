import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/page.tsx", import.meta.url);
const routePath = new URL("../app/api/conversations/[id]/chat/route.ts", import.meta.url);
const modelPath = new URL("../lib/agent-model.ts", import.meta.url);

test("chat UI models all recoverable request lifecycle states", async () => {
  const source = await readFile(pagePath, "utf8");

  for (const state of ["submitted", "processing", "tool", "approval", "streaming", "ready", "error", "cancelled"]) {
    assert.match(source, new RegExp(`RequestState[\\s\\S]*?"${state}"`));
  }
  assert.match(source, /setActiveRun\(\{ id: runId, request: clean, state: "submitted"/);
  assert.match(source, /aria-label=\{activeRequestRef\.current \? "Stop response" : "Send message"\}/);
  assert.match(source, /activeRequestRef\.current\?\.abort\(\)/);
  assert.match(source, /AID could not complete this request/);
  assert.match(source, /Stopped by you/);
  assert.match(source, /No external action was sent or changed without your approval/);
  assert.match(source, /setDraft\(clean\)/);
});

test("chat UI renders truthful operation cards and throttles streamed paint updates", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /search_gmail: "Searching Gmail"/);
  assert.match(source, /list_calendar_events: "Checking Calendar availability"/);
  assert.match(source, /search_drive: "Searching Drive"/);
  assert.match(source, /performance\.now\(\) - lastPaint >= 50/);
  assert.match(source, /payload\.type === "tool_start"/);
  assert.match(source, /payload\.type === "tool_result"/);
  assert.match(source, /payload\.type === "approval"/);
});

test("server records tool duration and cancels model work when the client disconnects", async () => {
  const [route, model] = await Promise.all([readFile(routePath, "utf8"), readFile(modelPath, "utf8")]);

  assert.match(route, /completeAgent\(history, \{ signal: request\.signal \}\)/);
  assert.match(route, /duration_ms: Date\.now\(\) - toolStartedAt/);
  assert.match(route, /status: code === "REQUEST_CANCELLED" \? "cancelled" : "failed"/);
  assert.match(model, /signal\?: AbortSignal/);
  assert.match(model, /options\.signal\?\.addEventListener\("abort"/);
  assert.match(model, /throw new Error\("REQUEST_CANCELLED"\)/);
});
