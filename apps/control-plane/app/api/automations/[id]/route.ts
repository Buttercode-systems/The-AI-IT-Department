import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../lib/api-auth";
import { nextAutomationRun, normalizeScheduleConfig, type AutomationScheduleConfig, type AutomationScheduleType } from "../../../../lib/automation-schedule";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { recordUsage } from "../../../../lib/runtime-controls";
import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

const selectFields = "id,name,instruction,schedule_type,cron_expression,timezone,status,next_run_at,last_run_at,created_at,updated_at,conversation_id,schedule_config,approval_mode,last_error_code,consecutive_failures";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const rateLimit = await consumeRateLimit(organizationId, user.id, "automation_write", 20, 60);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as {
      name?: string;
      instruction?: string;
      schedule_type?: AutomationScheduleType;
      schedule_config?: AutomationScheduleConfig;
      timezone?: string;
      status?: "active" | "paused" | "disabled";
      approval_mode?: "always_ask" | "read_only_only";
    };
    const admin = createSupabaseAdminClient();
    const { data: current } = await admin.from("automations").select(selectFields).eq("id", id).eq("organization_id", organizationId).maybeSingle();
    if (!current) return NextResponse.json({ error: "AUTOMATION_NOT_FOUND" }, { status: 404 });

    const scheduleType = body.schedule_type ?? current.schedule_type as AutomationScheduleType;
    if (!["daily", "weekly", "manual"].includes(scheduleType)) return NextResponse.json({ error: "AUTOMATION_SCHEDULE_INVALID" }, { status: 400 });
    const timezone = body.timezone?.trim() || current.timezone;
    const scheduleConfig = normalizeScheduleConfig(scheduleType, body.schedule_config ?? current.schedule_config ?? {});
    const status = body.status ?? current.status;
    const nextRun = status === "active" ? nextAutomationRun(scheduleType, scheduleConfig, timezone) : null;
    const updates: Record<string, unknown> = {
      schedule_type: scheduleType,
      schedule_config: scheduleConfig,
      timezone,
      status,
      next_run_at: nextRun?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    };
    if (typeof body.name === "string") updates.name = body.name.trim().slice(0, 120) || current.name;
    if (typeof body.instruction === "string") updates.instruction = body.instruction.trim().slice(0, 4_000) || current.instruction;
    if (body.approval_mode) updates.approval_mode = body.approval_mode;

    const { data, error } = await admin.from("automations").update(updates).eq("id", id).eq("organization_id", organizationId).select(selectFields).single();
    if (error || !data) throw new Error("AUTOMATION_UPDATE_FAILED");
    await Promise.all([
      recordUsage({ organizationId, userId: user.id, eventType: "automation_updated", metadata: { automation_id: id, status: data.status } }),
      admin.from("audit_events").insert({ organization_id: organizationId, actor_user_id: user.id, source: "control_plane", tool_name: "update_automation", resource_type: "automation", operation: "update", result: "success", metadata: { automation_id: id, status: data.status, next_run_at: data.next_run_at } }),
    ]);
    return NextResponse.json({ automation: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const rateLimit = await consumeRateLimit(organizationId, user.id, "automation_write", 20, 60);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
    const { id } = await context.params;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("automations").delete().eq("id", id).eq("organization_id", organizationId).select("id,name,conversation_id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "AUTOMATION_NOT_FOUND" }, { status: 404 });
    if (data.conversation_id) await admin.from("conversations").delete().eq("id", data.conversation_id).eq("organization_id", organizationId);
    await Promise.all([
      recordUsage({ organizationId, userId: user.id, eventType: "automation_deleted", metadata: { automation_id: id } }),
      admin.from("audit_events").insert({ organization_id: organizationId, actor_user_id: user.id, source: "control_plane", tool_name: "delete_automation", resource_type: "automation", operation: "delete", result: "success", metadata: { automation_id: id, name: data.name } }),
    ]);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
