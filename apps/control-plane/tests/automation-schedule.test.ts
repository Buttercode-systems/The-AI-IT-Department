import test from "node:test";
import assert from "node:assert/strict";
import { nextAutomationRun, normalizeScheduleConfig } from "../lib/automation-schedule.ts";

test("daily schedules advance to the next local day after the time passes", () => {
  const from = new Date("2026-07-16T10:00:00.000Z");
  const next = nextAutomationRun("daily", { hour: 8, minute: 0 }, "Africa/Johannesburg", from);
  assert.equal(next?.toISOString(), "2026-07-17T06:00:00.000Z");
});

test("weekly schedules respect local weekday and timezone", () => {
  const from = new Date("2026-07-16T10:00:00.000Z");
  const next = nextAutomationRun("weekly", { weekday: 5, hour: 9, minute: 30 }, "Africa/Johannesburg", from);
  assert.equal(next?.toISOString(), "2026-07-17T07:30:00.000Z");
});

test("manual schedules have no next run", () => {
  assert.equal(nextAutomationRun("manual", {}, "Africa/Johannesburg"), null);
});

test("invalid schedule values are rejected", () => {
  assert.throws(() => normalizeScheduleConfig("daily", { hour: 25 }), /AUTOMATION_HOUR_INVALID/);
  assert.throws(() => normalizeScheduleConfig("weekly", { hour: 9, weekday: 8 }), /AUTOMATION_WEEKDAY_INVALID/);
});
