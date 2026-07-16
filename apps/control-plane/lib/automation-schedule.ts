export type AutomationScheduleType = "daily" | "weekly" | "manual";
export type AutomationScheduleConfig = {
  hour?: number;
  minute?: number;
  weekday?: number;
};

function parts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: weekdays[values.weekday] ?? 0,
  };
}

function localToUtc(input: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string) {
  let timestamp = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0, 0);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = parts(new Date(timestamp), timeZone);
    const desiredLocal = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0, 0);
    const observedLocal = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, 0, 0);
    timestamp += desiredLocal - observedLocal;
  }
  return new Date(timestamp);
}

function addLocalDays(local: ReturnType<typeof parts>, days: number) {
  const shifted = new Date(Date.UTC(local.year, local.month - 1, local.day + days, local.hour, local.minute, local.second));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function normalizeScheduleConfig(type: AutomationScheduleType, config: AutomationScheduleConfig) {
  if (type === "manual") return {};
  const hour = Number(config.hour);
  const minute = Number(config.minute ?? 0);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("AUTOMATION_HOUR_INVALID");
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("AUTOMATION_MINUTE_INVALID");
  if (type === "weekly") {
    const weekday = Number(config.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error("AUTOMATION_WEEKDAY_INVALID");
    return { hour, minute, weekday };
  }
  return { hour, minute };
}

export function nextAutomationRun(type: AutomationScheduleType, config: AutomationScheduleConfig, timeZone: string, from = new Date()) {
  if (type === "manual") return null;
  const normalized = normalizeScheduleConfig(type, config);
  const local = parts(from, timeZone);
  let daysAhead = 0;
  if (type === "weekly") {
    daysAhead = ((normalized.weekday as number) - local.weekday + 7) % 7;
  }
  let date = addLocalDays(local, daysAhead);
  let candidate = localToUtc({ ...date, hour: normalized.hour as number, minute: normalized.minute as number }, timeZone);
  if (candidate.getTime() <= from.getTime()) {
    date = addLocalDays(local, type === "weekly" ? daysAhead + 7 : 1);
    candidate = localToUtc({ ...date, hour: normalized.hour as number, minute: normalized.minute as number }, timeZone);
  }
  return candidate;
}
