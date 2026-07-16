import { runAutomation, type AutomationRow } from "../../../../lib/automation-runner";
import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();
  const { data, error } = await admin.from("automations")
    .select("id,organization_id,user_id,conversation_id,name,instruction,schedule_type,schedule_config,timezone,status,approval_mode,consecutive_failures")
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(10);
  if (error) return Response.json({ error: "AUTOMATION_QUERY_FAILED" }, { status: 500 });

  const results = [];
  for (const automation of (data ?? []) as AutomationRow[]) {
    results.push(await runAutomation(automation, now, "schedule"));
  }

  return Response.json({ checked_at: now.toISOString(), due: data?.length ?? 0, results }, { headers: { "cache-control": "no-store" } });
}
