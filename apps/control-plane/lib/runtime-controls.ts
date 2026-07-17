import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "./server-supabase";
export { safeErrorCode } from "./runtime-policy";

export type RuntimeContext = {
  correlationId: string;
  startedAt: number;
};

export function createRuntimeContext(): RuntimeContext {
  return { correlationId: randomUUID(), startedAt: Date.now() };
}

export function requestMetadata(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    user_agent: request.headers.get("user-agent")?.slice(0, 240) ?? null,
    country: request.headers.get("x-vercel-ip-country") ?? null,
    region: request.headers.get("x-vercel-ip-country-region") ?? null,
    forwarded_for_hash_source_present: Boolean(forwardedFor),
  };
}

export async function recordUsage(input: {
  organizationId: string;
  userId?: string | null;
  eventType: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("usage_events").insert({
    organization_id: input.organizationId,
    user_id: input.userId ?? null,
    event_type: input.eventType,
    quantity: input.quantity ?? 1,
    metadata: input.metadata ?? {},
  });
  if (error) console.error("usage_event_insert_failed", { eventType: input.eventType, code: error.code });
}

export async function finishRun(input: {
  runId: string | null;
  correlationId: string;
  startedAt: number;
  status: "completed" | "awaiting_approval" | "failed";
  responseText?: string | null;
  toolCalls?: Array<Record<string, unknown>>;
  errorCode?: string | null;
}) {
  if (!input.runId) return;
  const admin = createSupabaseAdminClient();
  await admin.from("agent_runs").update({
    status: input.status,
    response_text: input.responseText ?? null,
    tool_calls: input.toolCalls ?? [],
    error_code: input.errorCode ?? null,
    duration_ms: Math.max(Date.now() - input.startedAt, 0),
    completed_at: new Date().toISOString(),
  }).eq("id", input.runId).eq("correlation_id", input.correlationId);
}
