import { getUserOrganization, requireBearerUser } from "../../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const admin = createSupabaseAdminClient();

    const [
      organization,
      memberships,
      profile,
      connections,
      conversations,
      messages,
      memories,
      automations,
      automationRuns,
      approvals,
      agentRuns,
      auditEvents,
      usageEvents,
    ] = await Promise.all([
      admin.from("organizations").select("*").eq("id", organizationId).single(),
      admin.from("memberships").select("organization_id,user_id,role,created_at").eq("organization_id", organizationId),
      admin.from("business_profiles").select("*").eq("organization_id", organizationId).maybeSingle(),
      admin.from("provider_connections").select("id,provider,status,provider_account_label,granted_scopes,last_verified_at,created_at,updated_at,revoked_at").eq("organization_id", organizationId),
      admin.from("conversations").select("*").eq("organization_id", organizationId).order("created_at"),
      admin.from("conversation_messages").select("id,conversation_id,role,content,tool_name,metadata,created_at").eq("organization_id", organizationId).order("created_at"),
      admin.from("workspace_memories").select("*").eq("organization_id", organizationId).order("created_at"),
      admin.from("automations").select("*").eq("organization_id", organizationId).order("created_at"),
      admin.from("automation_runs").select("*").eq("organization_id", organizationId).order("started_at"),
      admin.from("agent_approvals").select("id,conversation_id,tool_name,arguments,summary,risk_level,status,result,error_code,expires_at,created_at,decided_at,executed_at,provider,execution_attempts,last_attempt_at").eq("organization_id", organizationId).order("created_at"),
      admin.from("agent_runs").select("*").eq("organization_id", organizationId).order("started_at"),
      admin.from("audit_events").select("*").eq("organization_id", organizationId).order("created_at"),
      admin.from("usage_events").select("*").eq("organization_id", organizationId).order("created_at"),
    ]);

    const failures = [organization, memberships, profile, connections, conversations, messages, memories, automations, automationRuns, approvals, agentRuns, auditEvents, usageEvents]
      .map((result) => result.error)
      .filter(Boolean);
    if (failures.length) throw new Error("ACCOUNT_EXPORT_FAILED");

    const exportedAt = new Date().toISOString();
    const payload = {
      export_version: 1,
      exported_at: exportedAt,
      account: { id: user.id, email: user.email ?? null, created_at: user.created_at },
      organization: organization.data,
      memberships: memberships.data ?? [],
      business_profile: profile.data,
      provider_connections: connections.data ?? [],
      conversations: conversations.data ?? [],
      conversation_messages: messages.data ?? [],
      workspace_memories: memories.data ?? [],
      automations: automations.data ?? [],
      automation_runs: automationRuns.data ?? [],
      approvals: approvals.data ?? [],
      agent_runs: agentRuns.data ?? [],
      audit_events: auditEvents.data ?? [],
      usage_events: usageEvents.data ?? [],
    };

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="aid-account-export-${exportedAt.slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return Response.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
