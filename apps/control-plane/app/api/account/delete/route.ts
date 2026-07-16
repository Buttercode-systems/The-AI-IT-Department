import { NextResponse } from "next/server";
import { requireBearerUser } from "../../../../lib/api-auth";
import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const admin = createSupabaseAdminClient();

    const { data: membership } = await admin
      .from("memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membership?.organization_id) {
      const { data: connections } = await admin
        .from("provider_connections")
        .select("token_ciphertext")
        .eq("organization_id", membership.organization_id)
        .eq("provider", "google")
        .neq("status", "revoked");

      if (connections?.length) {
        await admin.from("provider_connections").update({
          status: "revoked",
          token_ciphertext: null,
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("organization_id", membership.organization_id).eq("provider", "google");
      }

      await admin.from("organizations").delete().eq("id", membership.organization_id);
    }

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error("AUTH_USER_DELETE_FAILED");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
