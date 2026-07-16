export const dynamic = "force-dynamic";

// This endpoint exposes readiness booleans only; it never returns secrets.
export async function GET() {
  const modelProvider = process.env.GROQ_API_KEY
    ? "groq"
    : process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
      ? "vercel-ai-gateway"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : null;

  return Response.json({
    status: modelProvider ? "ready" : "degraded",
    model_provider_configured: Boolean(modelProvider),
    model_provider: modelProvider,
    supabase_configured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    google_oauth_configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    token_encryption_configured: Boolean(process.env.TOKEN_ENCRYPTION_KEY),
  });
}
