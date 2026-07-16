import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../lib/server-supabase";

export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const { data, error } = await createSupabaseAdminClient()
      .from("audit_events")
      .select("id,source,tool_name,provider,resource_type,operation,result,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("AUDIT_LOAD_FAILED");
    return NextResponse.json({ events: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
