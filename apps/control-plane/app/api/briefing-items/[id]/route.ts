import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

const allowed = new Set(["open", "done", "dismissed", "snoozed"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const { id } = await context.params;
    const body = await request.json() as { state?: string; snoozed_until?: string | null };
    if (!body.state || !allowed.has(body.state)) return NextResponse.json({ error: "INVALID_STATE" }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const update: Record<string, unknown> = {
      state: body.state,
      updated_at: new Date().toISOString(),
      snoozed_until: body.state === "snoozed" ? body.snoozed_until ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
    };

    const { data, error } = await admin
      .from("briefing_items")
      .update(update)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("*")
      .single();
    if (error || !data) return NextResponse.json({ error: "ITEM_NOT_FOUND" }, { status: 404 });

    await admin.from("audit_events").insert({
      organization_id: organizationId,
      actor_user_id: user.id,
      source: "control_plane",
      tool_name: "update_briefing_item",
      resource_type: "briefing_item",
      resource_id: id,
      operation: body.state,
      result: "success",
    });

    return NextResponse.json({ item: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
