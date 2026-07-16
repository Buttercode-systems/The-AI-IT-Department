import { NextResponse } from "next/server";
import { decryptSecret, encryptSecret, sha256 } from "../../../../../lib/crypto";
import { createSupabaseAdminClient } from "../../../../../lib/server-supabase";

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  name?: string;
};

function redirectWith(request: Request, key: string, value: string) {
  const url = new URL("/", request.url);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  if (providerError) return redirectWith(request, "error", `google_${providerError}`);
  if (!code || !state) return redirectWith(request, "error", "invalid_oauth_callback");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectWith(request, "error", "google_not_configured");

  const admin = createSupabaseAdminClient();
  const { data: oauthState, error: stateError } = await admin
    .from("oauth_states")
    .select("id, organization_id, user_id, code_verifier_ciphertext, redirect_uri, expires_at, consumed_at")
    .eq("state_hash", sha256(state))
    .single();

  if (
    stateError ||
    !oauthState ||
    oauthState.consumed_at ||
    new Date(oauthState.expires_at).getTime() <= Date.now()
  ) {
    return redirectWith(request, "error", "invalid_or_expired_oauth_state");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: decryptSecret(oauthState.code_verifier_ciphertext),
      grant_type: "authorization_code",
      redirect_uri: oauthState.redirect_uri,
    }),
    cache: "no-store",
  });

  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokens.access_token) {
    await admin.from("oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", oauthState.id);
    console.error("Google token exchange failed", tokens.error, tokens.error_description);
    return redirectWith(request, "error", tokens.error ?? "google_token_exchange_failed");
  }

  const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
  });
  const googleUser = (await userInfoResponse.json()) as GoogleUserInfo;

  if (!userInfoResponse.ok || !googleUser.sub || !googleUser.email) {
    return redirectWith(request, "error", "google_identity_failed");
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;
  const encryptedTokens = encryptSecret(JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
  }));

  const { error: connectionError } = await admin.from("provider_connections").upsert({
    organization_id: oauthState.organization_id,
    user_id: oauthState.user_id,
    provider: "google",
    provider_account_id: googleUser.sub,
    provider_account_label: googleUser.email,
    status: "connected",
    granted_scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
    token_ciphertext: encryptedTokens,
    token_key_version: 1,
    expires_at: expiresAt,
    last_verified_at: new Date().toISOString(),
    revoked_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,provider,provider_account_id" });

  await admin.from("oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", oauthState.id);

  if (connectionError) {
    console.error("Failed to save Google connection", connectionError);
    return redirectWith(request, "error", "connection_save_failed");
  }

  await admin.from("audit_events").insert({
    organization_id: oauthState.organization_id,
    actor_user_id: oauthState.user_id,
    source: "control_plane",
    tool_name: "connect_google",
    provider: "google",
    resource_type: "provider_connection",
    operation: "oauth_connected",
    result: "success",
  });

  return redirectWith(request, "connected", "google");
}
