import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../lib/server-supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const admin = createSupabaseAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [{ data: runs }, { data: approvals }, { data: connections }, { data: usage }] = await Promise.all([
      admin.from("agent_runs").select("status,duration_ms,error_code,provider,model,started_at").eq("organization_id", organizationId).gte("started_at", since).order("started_at", { ascending: false }).limit(100),
      admin.from("agent_approvals").select("status,risk_level,tool_name,created_at,executed_at").eq("organization_id", organizationId).gte("created_at", since).order("created_at", { ascending: false }).limit(100),
      admin.from("provider_connections").select("provider,status,last_verified_at,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }),
      admin.from("usage_events").select("event_type,quantity,created_at").eq("organization_id", organizationId).gte("created_at", since).order("created_at", { ascending: false }).limit(250),
    ]);

    const runRows = runs ?? [];
    const completed = runRows.filter((run) => run.status === "completed" || run.status === "awaiting_approval");
    const durations = completed.map((run) => Number(run.duration_ms ?? 0)).filter((value) => value > 0);
    const averageDurationMs = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
    const usageTotals = (usage ?? []).reduce<Record<string, number>>((totals, item) => {
      totals[item.event_type] = (totals[item.event_type] ?? 0) + Number(item.quantity ?? 0);
      return totals;
    }, {});

    return NextResponse.json({
      period: "24h",
      generated_at: new Date().toISOString(),
      agent_runs: {
        total: runRows.length,
        successful: completed.length,
        failed: runRows.filter((run) => run.status === "failed").length,
        awaiting_approval: runRows.filter((run) => run.status === "awaiting_approval").length,
        average_duration_ms: averageDurationMs,
        recent_errors: runRows.filter((run) => run.error_code).slice(0, 10).map((run) => ({ code: run.error_code, at: run.started_at })),
      },
      approvals: {
        total: approvals?.length ?? 0,
        pending: approvals?.filter((item) => item.status === "pending").length ?? 0,
        executed: approvals?.filter((item) => item.status === "executed").length ?? 0,
        failed: approvals?.filter((item) => item.status === "failed").length ?? 0,
      },
      connections: connections ?? [],
      usage: usageTotals,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
