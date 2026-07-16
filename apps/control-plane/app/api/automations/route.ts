import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../lib/api-auth";
import { nextAutomationRun, normalizeScheduleConfig, type AutomationScheduleConfig, type AutomationScheduleType } from "../../../lib/automation-schedule";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { recordUsage } from "../../../lib/runtime-controls";
import { createSupabaseAdminClient } from "../../../lib/server-supabase";

const selectFields = "id,name,instruction,schedule_type,cron_expression,timezone,status,next_run_at,last_run_at,created_at,updated_at,conversation_id,schedule_config,approval_mode,last_error_code,consecutive_failures";

export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const admin = createSupabaseAdminClient();
    const [{ data: automations, error }, { data: runs }] = await Promise.all([
      admin.from("automations").select(selectFields).eq("organization_id", organizationId).order("created_at", { ascending: false }),
      admin.from("automation_runs").select("id,automation_id,status,error_code,started_at,completed_at,scheduled_for,duration_ms").eq("organization_id", organizationId).order("started_at", { ascending: false }).limit(100),
    ]);
    if (error) throw error;
    return NextResponse.json({ automations: automations ?? [], recent_runs: runs ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const rateLimit = await consumeRateLimit(organizationId, user.id, "automation_write", 20, 60);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
    const body = await request.json().catch(() => ({})) as {
      name?: string;
      instruction?: string;
      schedule_type?: AutomationScheduleType;
      schedule_config?: AutomationScheduleConfig;
      timezone?: string;
      approval_mode?: "always_ask" | "read_only_only";
    };
    const name = body.name?.trim().slice(0, 120);
    const instruction = body.instruction?.trim().slice(0, 4_000);
    const scheduleType = body.schedule_type ?? "manual";
    if (!name || !instruction) return NextResponse.json({ error: "AUTOMATION_INPUT_REQUIRED" }, { status: 400 });
    if (!["daily", "weekly", "manual"].includes(scheduleType)) return NextResponse.json({ error: "AUTOMATION_SCHEDULE_INVALID" }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin.from("business_profiles").select("timezone").eq("organization_id", organizationId).maybeSingle();
    const timezone = body.timezone?.trim() || profile?.timezone || "Africa/Johannesburg";
    const scheduleConfig = normalizeScheduleConfig(scheduleType, body.schedule_config ?? {});
    const nextRun = nextAutomationRun(scheduleType, scheduleConfig, timezone);

    const { data: conversation, error: conversationError } = await admin.from("conversations").insert({
      organization_id: organizationId,
      user_id: user.id,
      title: `Automation: ${name}`.slice(0, 100),
    }).select("id").single();
    if (conversationError || !conversation) throw new Error("AUTOMATION_CONVERSATION_CREATE_FAILED");

    const { data, error } = await admin.from("automations").insert({
      organization_id: organizationId,
      user_id: user.id,
      conversation_id: conversation.id,
      name,
      instruction,
      schedule_type: scheduleType,
      cron_expression: null,
      timezone,
      status: "active",
      next_run_at: nextRun?.toISOString() ?? null,
      schedule_config: scheduleConfig,
      approval_mode: body.approval_mode === "read_only_only" ? "read_only_only" : "always_ask",
    }).select(selectFields).single();
    if (error || !data) {
      await admin.from("conversations").delete().eq("id", conversation.id).eq("organization_id", organizationId);
      throw new Error("AUTOMATION_CREATE_FAILED");
    }
    await Promise.all([
      recordUsage({ organizationId, userId: user.id, eventType: "automation_created", metadata: { automation_id: data.id, schedule_type: scheduleType } }),
      admin.from("audit_events").insert({ organization_id: organizationId, actor_user_id: user.id, source: "control_plane", tool_name: "create_automation", resource_type: "automation", operation: "create", result: "success", metadata: { automation_id: data.id, schedule_type: scheduleType, next_run_at: data.next_run_at } }),
    ]);
    return NextResponse.json({ automation: data }, { status: 201, headers: { "x-ratelimit-remaining": String(rateLimit.remaining), "x-ratelimit-reset": rateLimit.reset_at } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
