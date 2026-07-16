import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../lib/server-supabase";

export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const admin = createSupabaseAdminClient();
    await admin.from("agent_approvals").update({ status: "expired", decided_at: new Date().toISOString() })
      .eq("organization_id", organizationId).eq("status", "pending").lt("expires_at", new Date().toISOString());
    const { data, error } = await admin.from("agent_approvals")
      .select("id,conversation_id,tool_name,arguments,summary,risk_level,status,result,error_code,expires_at,created_at,decided_at,executed_at")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ approvals: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
