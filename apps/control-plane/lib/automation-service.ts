import { nextAutomationRun, normalizeScheduleConfig, type AutomationScheduleConfig, type AutomationScheduleType } from "./automation-schedule";
import { recordUsage } from "./runtime-controls";
import { createSupabaseAdminClient } from "./server-supabase";

export const automationSelectFields = "id,name,instruction,schedule_type,cron_expression,timezone,status,next_run_at,last_run_at,created_at,updated_at,conversation_id,schedule_config,approval_mode,last_error_code,consecutive_failures";

type Context = { organizationId: string; userId: string };

export async function listAutomations(context: Context) {
  const { data, error } = await createSupabaseAdminClient().from("automations")
    .select(automationSelectFields)
    .eq("organization_id", context.organizationId)
    .eq("user_id", context.userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("AUTOMATION_LIST_FAILED");
  return data ?? [];
}

export async function createAutomation(input: {
  name: string;
  instruction: string;
  scheduleType: AutomationScheduleType;
  scheduleConfig: AutomationScheduleConfig;
  timezone: string;
  approvalMode: "always_ask" | "read_only_only";
}, context: Context) {
  const admin = createSupabaseAdminClient();
  const name = input.name.trim().slice(0, 120);
  const instruction = input.instruction.trim().slice(0, 4_000);
  if (!name || !instruction) throw new Error("AUTOMATION_INPUT_REQUIRED");
  const scheduleConfig = normalizeScheduleConfig(input.scheduleType, input.scheduleConfig);
  const nextRun = nextAutomationRun(input.scheduleType, scheduleConfig, input.timezone);
  const { data: conversation, error: conversationError } = await admin.from("conversations").insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    title: `Automation: ${name}`.slice(0, 100),
  }).select("id").single();
  if (conversationError || !conversation) throw new Error("AUTOMATION_CONVERSATION_CREATE_FAILED");

  const { data, error } = await admin.from("automations").insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    conversation_id: conversation.id,
    name,
    instruction,
    schedule_type: input.scheduleType,
    timezone: input.timezone,
    status: "active",
    next_run_at: nextRun?.toISOString() ?? null,
    schedule_config: scheduleConfig,
    approval_mode: input.approvalMode,
  }).select(automationSelectFields).single();
  if (error || !data) {
    await admin.from("conversations").delete().eq("id", conversation.id);
    throw new Error("AUTOMATION_CREATE_FAILED");
  }
  await Promise.all([
    recordUsage({ organizationId: context.organizationId, userId: context.userId, eventType: "automation_created", metadata: { automation_id: data.id, schedule_type: input.scheduleType } }),
    admin.from("audit_events").insert({ organization_id: context.organizationId, actor_user_id: context.userId, source: "assistant", tool_name: "create_automation", resource_type: "automation", operation: "create", result: "success", metadata: { automation_id: data.id, schedule_type: input.scheduleType, next_run_at: data.next_run_at } }),
  ]);
  return data;
}

export async function setAutomationStatus(id: string, status: "active" | "paused", context: Context) {
  const admin = createSupabaseAdminClient();
  const { data: current } = await admin.from("automations").select(automationSelectFields).eq("id", id).eq("organization_id", context.organizationId).eq("user_id", context.userId).maybeSingle();
  if (!current) throw new Error("AUTOMATION_NOT_FOUND");
  const nextRun = status === "active" ? nextAutomationRun(current.schedule_type as AutomationScheduleType, current.schedule_config ?? {}, current.timezone) : null;
  const { data, error } = await admin.from("automations").update({
    status,
    next_run_at: nextRun?.toISOString() ?? null,
    consecutive_failures: status === "active" ? 0 : current.consecutive_failures,
    last_error_code: status === "active" ? null : current.last_error_code,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("organization_id", context.organizationId).select(automationSelectFields).single();
  if (error || !data) throw new Error("AUTOMATION_UPDATE_FAILED");
  await admin.from("audit_events").insert({ organization_id: context.organizationId, actor_user_id: context.userId, source: "assistant", tool_name: `${status}_automation`, resource_type: "automation", operation: "update", result: "success", metadata: { automation_id: id, status, next_run_at: data.next_run_at } });
  return data;
}

export async function deleteAutomation(id: string, context: Context) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("automations").delete().eq("id", id).eq("organization_id", context.organizationId).eq("user_id", context.userId).select("id,name,conversation_id").maybeSingle();
  if (error) throw new Error("AUTOMATION_DELETE_FAILED");
  if (!data) throw new Error("AUTOMATION_NOT_FOUND");
  if (data.conversation_id) await admin.from("conversations").delete().eq("id", data.conversation_id).eq("organization_id", context.organizationId);
  await admin.from("audit_events").insert({ organization_id: context.organizationId, actor_user_id: context.userId, source: "assistant", tool_name: "delete_automation", resource_type: "automation", operation: "delete", result: "success", metadata: { automation_id: id, name: data.name } });
  return { deleted: true, id, name: data.name };
}
