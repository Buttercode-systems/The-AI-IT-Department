import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../lib/server-supabase";

export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const { data, error } = await createSupabaseAdminClient()
      .from("conversations")
      .select("id,title,status,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ conversations: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const body = await request.json().catch(() => ({})) as { title?: string };
    const { data, error } = await createSupabaseAdminClient()
      .from("conversations")
      .insert({ organization_id: organizationId, user_id: user.id, title: body.title?.trim().slice(0, 100) || "New conversation" })
      .select("id,title,status,created_at,updated_at")
      .single();
    if (error || !data) throw new Error("CONVERSATION_CREATE_FAILED");
    return NextResponse.json({ conversation: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
