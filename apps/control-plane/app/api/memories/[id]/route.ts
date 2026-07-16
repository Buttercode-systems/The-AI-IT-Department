import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../lib/api-auth";
import { consumeRateLimit, rateLimitResponse } from "../../../../lib/rate-limit";
import { recordUsage } from "../../../../lib/runtime-controls";
import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const rateLimit = await consumeRateLimit(organizationId, user.id, "memory_write", 30, 60);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { value?: unknown; category?: string; is_active?: boolean };
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.value !== undefined) updates.memory_value = body.value;
    if (typeof body.category === "string") updates.category = body.category.trim().slice(0, 60) || "business";
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("workspace_memories")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("id,memory_key,memory_value,category,source,confidence,is_active,created_at,updated_at,last_used_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
    await Promise.all([
      recordUsage({ organizationId, userId: user.id, eventType: "memory_updated", metadata: { memory_id: id } }),
      admin.from("audit_events").insert({ organization_id: organizationId, actor_user_id: user.id, source: "control_plane", tool_name: "update_memory", resource_type: "workspace_memory", operation: "update", result: "success", metadata: { memory_id: id } }),
    ]);
    return NextResponse.json({ memory: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const rateLimit = await consumeRateLimit(organizationId, user.id, "memory_write", 30, 60);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);
    const { id } = await context.params;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("workspace_memories")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("id,memory_key")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "MEMORY_NOT_FOUND" }, { status: 404 });
    await Promise.all([
      recordUsage({ organizationId, userId: user.id, eventType: "memory_deleted", metadata: { memory_id: id, memory_key: data.memory_key } }),
      admin.from("audit_events").insert({ organization_id: organizationId, actor_user_id: user.id, source: "control_plane", tool_name: "delete_memory", resource_type: "workspace_memory", operation: "delete", result: "success", metadata: { memory_id: id, memory_key: data.memory_key } }),
    ]);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
