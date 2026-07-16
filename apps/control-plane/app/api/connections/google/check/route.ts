import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../../lib/api-auth";
import { getGoogleAccessToken, getGoogleConnection, googleJson } from "../../../../../lib/google-connection";
import { createSupabaseAdminClient } from "../../../../../lib/server-supabase";

const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const connection = await getGoogleConnection(organizationId);
    const accessToken = await getGoogleAccessToken(connection);

    const [gmail, calendar] = await Promise.all([
      googleJson(accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/profile"),
      googleJson(accessToken, "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1"),
    ]);

    const scopes = Array.isArray(connection.granted_scopes) ? connection.granted_scopes as string[] : [];
    const scopesOk = REQUIRED_SCOPES.every((scope) => scopes.includes(scope));
    const passed = gmail.ok && calendar.ok && scopesOk;
    const now = new Date().toISOString();
    const admin = createSupabaseAdminClient();

    await admin.from("connection_tests").insert({
      organization_id: organizationId,
      connection_id: connection.id,
      user_id: user.id,
      status: passed ? "passed" : "failed",
      gmail_ok: gmail.ok,
      calendar_ok: calendar.ok,
      scopes_ok: scopesOk,
      details: {
        gmail_status: gmail.status,
        calendar_status: calendar.status,
        missing_scopes: REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope)),
      },
    });

    await admin.from("provider_connections").update({
      status: passed ? "connected" : "error",
      last_verified_at: now,
      updated_at: now,
    }).eq("id", connection.id);

    await admin.from("audit_events").insert({
      organization_id: organizationId,
      actor_user_id: user.id,
      source: "control_plane",
      tool_name: "check_google_connection",
      provider: "google",
      resource_type: "provider_connection",
      operation: "read_access_check",
      result: passed ? "success" : "failure",
    });

    return NextResponse.json({ passed, gmail_ok: gmail.ok, calendar_ok: calendar.ok, scopes_ok: scopesOk });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
