import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const admin = createSupabaseAdminClient();

    const { data: briefing } = await admin
      .from("briefings")
      .select("*")
      .eq("organization_id", organizationId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!briefing) return NextResponse.json({ briefing: null, items: [] });

    const { data: items } = await admin
      .from("briefing_items")
      .select("*")
      .eq("briefing_id", briefing.id)
      .order("created_at", { ascending: true });

    return NextResponse.json({ briefing, items: items ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
