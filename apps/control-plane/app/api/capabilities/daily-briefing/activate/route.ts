import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../../lib/api-auth";
import { getGoogleAccessToken, getGoogleConnection, googleJson } from "../../../../../lib/google-connection";
import { createSupabaseAdminClient } from "../../../../../lib/server-supabase";

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const admin = createSupabaseAdminClient();

    const { data: latestTest } = await admin
      .from("connection_tests")
      .select("status")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latestTest || latestTest.status !== "passed") {
      return NextResponse.json({ error: "RUN_CHECKS_FIRST" }, { status: 409 });
    }

    const connection = await getGoogleConnection(organizationId);
    const accessToken = await getGoogleAccessToken(connection);
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    const [gmail, calendar] = await Promise.all([
      googleJson(accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is%3Aunread"),
      googleJson(accessToken, `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=5&timeMin=${encodeURIComponent(dayStart.toISOString())}&timeMax=${encodeURIComponent(dayEnd.toISOString())}`),
    ]);
    if (!gmail.ok || !calendar.ok) {
      return NextResponse.json({ error: "GOOGLE_PREVIEW_FAILED" }, { status: 502 });
    }

    const gmailBody = gmail.body as { resultSizeEstimate?: number };
    const calendarBody = calendar.body as { items?: unknown[] };
    const activatedAt = new Date().toISOString();
    const preview = {
      unread_messages: gmailBody.resultSizeEstimate ?? 0,
      today_events: Array.isArray(calendarBody.items) ? calendarBody.items.length : 0,
      generated_at: activatedAt,
    };

    await admin.from("capabilities").upsert({
      organization_id: organizationId,
      user_id: user.id,
      capability_key: "daily_briefing",
      status: "active",
      config: { timezone: "Africa/Johannesburg", preview },
      activated_at: activatedAt,
      updated_at: activatedAt,
    }, { onConflict: "organization_id,capability_key" });

    await admin.from("audit_events").insert({
      organization_id: organizationId,
      actor_user_id: user.id,
      source: "control_plane",
      tool_name: "activate_daily_briefing",
      provider: "google",
      resource_type: "capability",
      operation: "activate",
      result: "success",
    });

    return NextResponse.json({ active: true, preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
