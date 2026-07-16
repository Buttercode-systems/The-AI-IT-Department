import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../lib/api-auth";
import { consumeRateLimit, rateLimitResponse } from "../../../lib/rate-limit";
import { recordUsage } from "../../../lib/runtime-controls";
import { createSupabaseAdminClient } from "../../../lib/server-supabase";

export async function GET(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const { data, error } = await createSupabaseAdminClient()
      .from("workspace_memories")
      .select("id,memory_key,memory_value,category,source,confidence,is_active,created_at,updated_at,last_used_at")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ memories: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const rateLimit = await consumeRateLimit(organizationId, user.id, "memory_write", 30, 60);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

    const body = await request.json().catch(() => ({})) as {
      key?: string;
      value?: unknown;
      category?: string;
      source?: string;
    };
    const key = body.key?.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key || key.length > 120) return NextResponse.json({ error: "MEMORY_KEY_INVALID" }, { status: 400 });
    if (body.value === undefined) return NextResponse.json({ error: "MEMORY_VALUE_REQUIRED" }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.from("workspace_memories").upsert({
      organization_id: organizationId,
      user_id: user.id,
      memory_key: key,
      memory_value: body.value,
      category: body.category?.trim().slice(0, 60) || "business",
      source: body.source?.trim().slice(0, 60) || "user",
      confidence: 1,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,memory_key" }).select("id,memory_key,memory_value,category,source,confidence,is_active,created_at,updated_at,last_used_at").single();
    if (error || !data) throw new Error("MEMORY_SAVE_FAILED");

    await Promise.all([
      recordUsage({ organizationId, userId: user.id, eventType: "memory_saved", metadata: { memory_id: data.id, memory_key: data.memory_key } }),
      admin.from("audit_events").insert({ organization_id: organizationId, actor_user_id: user.id, source: "assistant", tool_name: "save_memory", resource_type: "workspace_memory", operation: "upsert", result: "success", metadata: { memory_id: data.id, memory_key: data.memory_key } }),
    ]);
    return NextResponse.json({ memory: data }, { status: 201, headers: { "x-ratelimit-remaining": String(rateLimit.remaining), "x-ratelimit-reset": rateLimit.reset_at } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
