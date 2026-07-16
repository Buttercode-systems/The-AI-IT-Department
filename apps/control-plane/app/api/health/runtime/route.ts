export const dynamic = "force-dynamic";

export async function GET() {
  const modelProviderConfigured = Boolean(
    process.env.AI_GATEWAY_API_KEY ||
    process.env.VERCEL_OIDC_TOKEN ||
    process.env.OPENAI_API_KEY,
  );

  return Response.json({
    status: modelProviderConfigured ? "ready" : "degraded",
    model_provider_configured: modelProviderConfigured,
    supabase_configured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    google_oauth_configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    token_encryption_configured: Boolean(process.env.TOKEN_ENCRYPTION_KEY),
  });
}
