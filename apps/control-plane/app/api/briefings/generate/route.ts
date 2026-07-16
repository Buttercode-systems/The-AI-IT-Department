import { NextResponse } from "next/server";
import { getUserOrganization, requireBearerUser } from "../../../../lib/api-auth";
import { getGoogleAccessToken, getGoogleConnection, googleJson } from "../../../../lib/google-connection";
import { createSupabaseAdminClient } from "../../../../lib/server-supabase";

type GmailList = { messages?: Array<{ id: string; threadId?: string }> };
type GmailMessage = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
};
type CalendarList = { items?: Array<{ id?: string; summary?: string; description?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; organizer?: { displayName?: string; email?: string } }> };

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function priorityFor(subject: string, snippet: string) {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (/urgent|asap|overdue|final notice|today|immediately|deadline/.test(text)) return "urgent";
  if (/invoice|quote|approval|confirm|follow up|follow-up|payment|meeting|tomorrow/.test(text)) return "high";
  return "normal";
}

function reasonFor(subject: string, snippet: string) {
  const text = `${subject} ${snippet}`.toLowerCase();
  if (/overdue|payment|invoice/.test(text)) return "Possible money or payment action detected.";
  if (/approve|approval|confirm/.test(text)) return "A response or decision may be required.";
  if (/meeting|appointment|calendar/.test(text)) return "This may affect your schedule or preparation.";
  if (/urgent|asap|deadline|today/.test(text)) return "Time-sensitive language was detected.";
  return "Unread message selected from your recent inbox activity.";
}

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const organizationId = await getUserOrganization(user.id);
    const admin = createSupabaseAdminClient();

    const connection = await getGoogleConnection(organizationId);
    const accessToken = await getGoogleAccessToken(connection);
    const now = new Date();
    const end = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const [mailListResponse, calendarResponse] = await Promise.all([
      googleJson(accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=12&q=is%3Aunread%20newer_than%3A14d"),
      googleJson(accessToken, `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=8&timeMin=${encodeURIComponent(now.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`),
    ]);

    if (!mailListResponse.ok || !calendarResponse.ok) {
      return NextResponse.json({ error: "GOOGLE_BRIEFING_FETCH_FAILED" }, { status: 502 });
    }

    const mailList = mailListResponse.body as GmailList;
    const messages = await Promise.all((mailList.messages ?? []).slice(0, 10).map(async ({ id }) => {
      const response = await googleJson(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
      return response.ok ? response.body as GmailMessage : null;
    }));

    const emailItems = messages.filter((item): item is GmailMessage => Boolean(item)).map((message) => {
      const subject = header(message, "Subject") || "No subject";
      const sender = header(message, "From") || "Unknown sender";
      const snippet = (message.snippet ?? "").replace(/\s+/g, " ").trim();
      return {
        item_type: "email",
        priority: priorityFor(subject, snippet),
        title: subject,
        summary: snippet.slice(0, 260),
        reason: reasonFor(subject, snippet),
        source_label: sender,
        source_url: `https://mail.google.com/mail/u/0/#all/${message.threadId ?? message.id}`,
        source_id: message.id,
        due_at: null,
        metadata: { sender, received_at: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null },
      };
    });

    const calendar = calendarResponse.body as CalendarList;
    const calendarItems = (calendar.items ?? []).map((event) => {
      const startsAt = event.start?.dateTime ?? event.start?.date ?? null;
      return {
        item_type: "calendar",
        priority: startsAt && new Date(startsAt).getTime() - now.getTime() < 6 * 60 * 60 * 1000 ? "high" : "normal",
        title: event.summary || "Calendar event",
        summary: (event.description ?? "Upcoming event in your primary calendar.").replace(/\s+/g, " ").slice(0, 260),
        reason: "Upcoming event within the next 48 hours.",
        source_label: event.organizer?.displayName ?? event.organizer?.email ?? "Google Calendar",
        source_url: event.htmlLink ?? "https://calendar.google.com/calendar/u/0/r",
        source_id: event.id ?? null,
        due_at: startsAt,
        metadata: { starts_at: startsAt },
      };
    });

    const allItems = [...emailItems, ...calendarItems].sort((a, b) => {
      const order: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return order[a.priority] - order[b.priority];
    }).slice(0, 15);

    const summary = allItems.length
      ? `${allItems.filter((item) => item.priority === "urgent" || item.priority === "high").length} priority items from ${emailItems.length} unread emails and ${calendarItems.length} upcoming events.`
      : "Nothing urgent was found in the selected Gmail and Calendar window.";

    const { data: briefing, error: briefingError } = await admin.from("briefings").insert({
      organization_id: organizationId,
      user_id: user.id,
      status: "ready",
      summary,
      source_counts: { email: emailItems.length, calendar: calendarItems.length },
    }).select("*").single();
    if (briefingError || !briefing) throw new Error("BRIEFING_SAVE_FAILED");

    if (allItems.length) {
      const { error: itemError } = await admin.from("briefing_items").insert(allItems.map((item) => ({ ...item, briefing_id: briefing.id, organization_id: organizationId })));
      if (itemError) throw new Error("BRIEFING_ITEMS_SAVE_FAILED");
    }

    await admin.from("audit_events").insert({
      organization_id: organizationId,
      actor_user_id: user.id,
      source: "control_plane",
      tool_name: "generate_daily_briefing",
      provider: "google",
      resource_type: "briefing",
      operation: "create",
      result: "success",
    });

    const { data: savedItems } = await admin.from("briefing_items").select("*").eq("briefing_id", briefing.id).order("created_at");
    return NextResponse.json({ briefing, items: savedItems ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
