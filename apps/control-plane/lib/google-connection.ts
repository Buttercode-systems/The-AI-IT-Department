import { decryptSecret, encryptSecret } from "./crypto";
import { createSupabaseAdminClient } from "./server-supabase";

type StoredTokens = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
};

export async function getGoogleConnection(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("provider_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "google")
    .neq("status", "revoked")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !data || !data.token_ciphertext) throw new Error("GOOGLE_NOT_CONNECTED");
  return data;
}

export async function getGoogleAccessToken(connection: Record<string, any>) {
  const tokens = JSON.parse(decryptSecret(connection.token_ciphertext)) as StoredTokens;
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (tokens.access_token && expiresAt > Date.now() + 60_000) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error("GOOGLE_RECONNECT_REQUIRED");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const refreshed = await response.json() as { access_token?: string; expires_in?: number; token_type?: string; error?: string };
  if (!response.ok || !refreshed.access_token) throw new Error(refreshed.error ?? "GOOGLE_REFRESH_FAILED");

  const merged: StoredTokens = {
    access_token: refreshed.access_token,
    refresh_token: tokens.refresh_token,
    token_type: refreshed.token_type ?? tokens.token_type,
  };
  const expires = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
  await createSupabaseAdminClient().from("provider_connections").update({
    token_ciphertext: encryptSecret(JSON.stringify(merged)),
    expires_at: expires,
    updated_at: new Date().toISOString(),
  }).eq("id", connection.id);
  return merged.access_token;
}

export async function googleJson(accessToken: string, url: string) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}
