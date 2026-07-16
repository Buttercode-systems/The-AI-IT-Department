import { createSupabaseAdminClient } from "./server-supabase";

export type RateLimitResult = {
  allowed: boolean;
  request_count: number;
  remaining: number;
  reset_at: string;
};

export async function consumeRateLimit(
  organizationId: string,
  userId: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { data, error } = await createSupabaseAdminClient().rpc("consume_rate_limit", {
    p_organization_id: organizationId,
    p_user_id: userId,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error || !data?.[0]) throw new Error("RATE_LIMIT_CHECK_FAILED");
  return data[0] as RateLimitResult;
}

export function rateLimitResponse(result: RateLimitResult) {
  return Response.json(
    { error: "RATE_LIMIT_EXCEEDED", retry_after: result.reset_at },
    {
      status: 429,
      headers: {
        "retry-after": String(Math.max(Math.ceil((new Date(result.reset_at).getTime() - Date.now()) / 1000), 1)),
        "x-ratelimit-remaining": String(result.remaining),
        "x-ratelimit-reset": result.reset_at,
      },
    },
  );
}
