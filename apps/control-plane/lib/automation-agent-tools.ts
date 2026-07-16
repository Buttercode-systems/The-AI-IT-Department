import { createAutomation, deleteAutomation, listAutomations, setAutomationStatus } from "./automation-service";
import type { AutomationScheduleConfig, AutomationScheduleType } from "./automation-schedule";

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

export const automationAgentTools = [
  fn("list_automations", "List the user's scheduled and manual AID automations, including status and next run.", {}),
  fn("create_automation", "Create a durable AID automation only when the user explicitly asks for repeated or scheduled work. Daily requires hour/minute. Weekly also requires weekday where Sunday=0 and Saturday=6.", {
    name: { type: "string" },
    instruction: { type: "string" },
    schedule_type: { type: "string", enum: ["daily", "weekly", "manual"] },
    hour: { type: "integer", minimum: 0, maximum: 23 },
    minute: { type: "integer", minimum: 0, maximum: 59 },
    weekday: { type: "integer", minimum: 0, maximum: 6 },
    timezone: { type: "string" },
    approval_mode: { type: "string", enum: ["always_ask", "read_only_only"] },
  }, ["name", "instruction", "schedule_type", "timezone"]),
  fn("pause_automation", "Pause an automation after identifying its exact ID with list_automations.", { automation_id: { type: "string" } }, ["automation_id"]),
  fn("resume_automation", "Resume a paused automation after identifying its exact ID with list_automations.", { automation_id: { type: "string" } }, ["automation_id"]),
  fn("delete_automation", "Permanently delete an automation only when the user explicitly requests deletion and its exact ID is known.", { automation_id: { type: "string" } }, ["automation_id"]),
] as const;

export async function executeAutomationAgentTool(name: string, args: Record<string, unknown>, context: { organizationId: string; userId: string }) {
  if (name === "list_automations") return { automations: await listAutomations(context) };
  if (name === "create_automation") {
    const scheduleType = String(args.schedule_type ?? "manual") as AutomationScheduleType;
    const config: AutomationScheduleConfig = {
      hour: args.hour === undefined ? undefined : Number(args.hour),
      minute: args.minute === undefined ? undefined : Number(args.minute),
      weekday: args.weekday === undefined ? undefined : Number(args.weekday),
    };
    return {
      automation: await createAutomation({
        name: String(args.name ?? ""),
        instruction: String(args.instruction ?? ""),
        scheduleType,
        scheduleConfig: config,
        timezone: String(args.timezone ?? "Africa/Johannesburg"),
        approvalMode: args.approval_mode === "read_only_only" ? "read_only_only" : "always_ask",
      }, context),
    };
  }
  const id = String(args.automation_id ?? "");
  if (!id) throw new Error("AUTOMATION_ID_REQUIRED");
  if (name === "pause_automation") return { automation: await setAutomationStatus(id, "paused", context) };
  if (name === "resume_automation") return { automation: await setAutomationStatus(id, "active", context) };
  if (name === "delete_automation") return await deleteAutomation(id, context);
  return null;
}

export function isAutomationAgentTool(name: string) {
  return ["list_automations", "create_automation", "pause_automation", "resume_automation", "delete_automation"].includes(name);
}
