import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { encryptSecret, sha256 } from "../../../../lib/crypto";
import { createSupabaseAdminClient, createSupabaseServerClient } from "../../../../lib/server-supabase";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

function base64url(buffer: Buffer) {
  return buffer.toString("base64url");
}

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google OAuth is not configured" }, { status: 503 });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/?error=signin_required", request.url));

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.redirect(new URL("/?error=workspace_required", request.url));
  }

  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const redirectUri = `${new URL(request.url).origin}/api/connect/google/callback`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("oauth_states").insert({
    organization_id: membership.organization_id,
    user_id: user.id,
    provider: "google",
    state_hash: sha256(state),
    code_verifier_ciphertext: encryptSecret(verifier),
    redirect_uri: redirectUri,
    expires_at: expiresAt,
  });

  if (error) return NextResponse.redirect(new URL("/?error=oauth_state_failed", request.url));

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(authorizationUrl);
}
