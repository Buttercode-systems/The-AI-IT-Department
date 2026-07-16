import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  const modelProvider = process.env.GROQ_API_KEY
    ? "groq"
    : process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
      ? "vercel-ai-gateway"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : null;

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  let databaseReachable = false;
  if (supabaseConfigured) {
    try {
      const { error } = await createSupabaseAdminClient().from("organizations").select("id", { head: true, count: "exact" }).limit(1);
      databaseReachable = !error;
    } catch {
      databaseReachable = false;
    }
  }

  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const encryptionConfigured = Boolean(process.env.TOKEN_ENCRYPTION_KEY);
  const schedulerConfigured = Boolean(process.env.CRON_SECRET);
  const coreReady = Boolean(modelProvider && databaseReachable && googleConfigured && encryptionConfigured);

  return Response.json(
    {
      status: coreReady ? "ready" : "degraded",
      checked_at: checkedAt,
      model_provider_configured: Boolean(modelProvider),
      model_provider: modelProvider,
      supabase_configured: supabaseConfigured,
      database_reachable: databaseReachable,
      google_oauth_configured: googleConfigured,
      token_encryption_configured: encryptionConfigured,
      scheduler_configured: schedulerConfigured,
      scheduler_status: schedulerConfigured ? "ready" : "disabled",
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    },
    { status: coreReady ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
