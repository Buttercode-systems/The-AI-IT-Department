import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../../../lib/server-supabase";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const { id } = await context.params;
    const admin = createSupabaseAdminClient();
    const { data: conversation } = await admin.from("conversations").select("id,title").eq("id", id).eq("organization_id", organizationId).eq("user_id", user.id).single();
    if (!conversation) throw new Error("CONVERSATION_NOT_FOUND");
    const { data, error } = await admin.from("conversation_messages").select("id,role,content,tool_name,metadata,created_at").eq("conversation_id", id).order("created_at");
    if (error) throw error;
    return NextResponse.json({ conversation, messages: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : message === "CONVERSATION_NOT_FOUND" ? 404 : 400 });
  }
}
