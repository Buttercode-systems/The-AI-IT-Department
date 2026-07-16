import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const admin = createSupabaseAdminClient();

    const [{ data: connection }, { data: latestTest }, { data: capability }] = await Promise.all([
      admin.from("provider_connections").select("id,status,provider_account_label,last_verified_at,revoked_at").eq("organization_id", organizationId).eq("provider", "google").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("connection_tests").select("status,gmail_ok,calendar_ok,scopes_ok,details,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("capabilities").select("status,activated_at,config").eq("organization_id", organizationId).eq("capability_key", "daily_briefing").maybeSingle(),
    ]);

    return NextResponse.json({ connection, latestTest, capability });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
