import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../../lib/api-auth";
import { runAutomation, type AutomationRow } from "../../../../../lib/automation-runner";
import { consumeRateLimit, rateLimitResponse } from "../../../../../lib/rate-limit";
import { createSupabaseAdminClient } from "../../../../../lib/server-supabase";

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const rateLimit = await consumeRateLimit(organizationId, user.id, "automation_run", 10, 60);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
    const { id } = await context.params;
    const { data, error } = await createSupabaseAdminClient().from("automations")
      .select("id,organization_id,user_id,conversation_id,name,instruction,schedule_type,schedule_config,timezone,status,approval_mode,consecutive_failures")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "AUTOMATION_NOT_FOUND" }, { status: 404 });
    const result = await runAutomation(data as AutomationRow, new Date(), "manual");
    return NextResponse.json({ result }, { headers: { "x-ratelimit-remaining": String(rateLimit.remaining), "x-ratelimit-reset": rateLimit.reset_at } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
