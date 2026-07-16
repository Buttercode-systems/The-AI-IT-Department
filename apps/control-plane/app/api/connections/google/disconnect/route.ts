import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../../lib/api-auth";
import { getGoogleAccessToken, getGoogleConnection } from "../../../../../lib/google-connection";
import { createSupabaseAdminClient } from "../../../../../lib/server-supabase";

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const connection = await getGoogleConnection(organizationId);

    try {
      const accessToken = await getGoogleAccessToken(connection);
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: accessToken }),
        cache: "no-store",
      });
    } catch {
      // Local revocation must still complete if Google has already invalidated the token.
    }

    const now = new Date().toISOString();
    const admin = createSupabaseAdminClient();
    await Promise.all([
      admin.from("provider_connections").update({
        status: "revoked",
        token_ciphertext: null,
        expires_at: null,
        revoked_at: now,
        updated_at: now,
      }).eq("id", connection.id),
      admin.from("capabilities").update({ status: "inactive", updated_at: now }).eq("organization_id", organizationId),
      admin.from("audit_events").insert({
        organization_id: organizationId,
        actor_user_id: user.id,
        source: "control_plane",
        tool_name: "disconnect_google",
        provider: "google",
        resource_type: "provider_connection",
        operation: "revoke",
        result: "success",
      }),
    ]);

    return NextResponse.json({ disconnected: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
