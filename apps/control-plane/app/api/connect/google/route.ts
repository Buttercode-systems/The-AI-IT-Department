import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { encryptSecret, sha256 } from "../../../../lib/crypto";
import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

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

export async function POST(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth is not configured" }, { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!accessToken) {
    return NextResponse.json({ error: "Sign in is required" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const {
    data: { user },
    error: userError,
  } = await admin.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "Create your workspace before connecting Google." }, { status: 409 });
  }

  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const redirectUri = `${new URL(request.url).origin}/api/connect/google/callback`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await admin.from("oauth_states").insert({
    organization_id: membership.organization_id,
    user_id: user.id,
    provider: "google",
    state_hash: sha256(state),
    code_verifier_ciphertext: encryptSecret(verifier),
    redirect_uri: redirectUri,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("Failed to create OAuth state", error);
    return NextResponse.json({ error: "Could not start Google connection." }, { status: 500 });
  }

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

  return NextResponse.json({ url: authorizationUrl.toString() });
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/?error=use_connect_button", request.url));
}
