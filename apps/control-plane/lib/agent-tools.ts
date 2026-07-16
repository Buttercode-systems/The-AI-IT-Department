import { createSupabaseAdminClient } from "./server-supabase";
import { getGoogleAccessToken, getGoogleConnection, googleJson } from "./google-connection";

type ToolContext = { organizationId: string; userId: string };
type GmailList = { messages?: Array<{ id: string; threadId?: string }> };
type GmailMessage = { id: string; threadId?: string; snippet?: string; internalDate?: string; payload?: { headers?: Array<{ name: string; value: string }> } };
type CalendarList = { items?: Array<Record<string, unknown>> };

export const agentTools = [
  {
    type: "function",
    function: {
      name: "get_workspace_context",
      description: "Get the user's business profile, connected Google account, capability status and onboarding context.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_gmail",
      description: "Search recent Gmail messages. Use Gmail search syntax. Returns subject, sender, date, snippet and source URL.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query, for example: newer_than:30d appointment" },
          max_results: { type: "integer", minimum: 1, maximum: 20 },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_calendar_events",
      description: "List events from the primary Google Calendar in a requested time window.",
      parameters: {
        type: "object",
        properties: {
          time_min: { type: "string", description: "ISO 8601 start time" },
          time_max: { type: "string", description: "ISO 8601 end time" },
          max_results: { type: "integer", minimum: 1, maximum: 30 },
        },
        required: ["time_min", "time_max"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_latest_briefing",
      description: "Get the most recently generated daily briefing and its open action items.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
] as const;

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function googleToken(organizationId: string) {
  const connection = await getGoogleConnection(organizationId);
  return getGoogleAccessToken(connection);
}

export async function executeAgentTool(name: string, args: Record<string, unknown>, context: ToolContext) {
  const admin = createSupabaseAdminClient();

  if (name === "get_workspace_context") {
    const [{ data: organization }, { data: profile }, { data: connection }, { data: capability }] = await Promise.all([
      admin.from("organizations").select("id,name").eq("id", context.organizationId).single(),
      admin.from("business_profiles").select("business_type,user_role,timezone,communication_style,operating_context,onboarding_completed_at").eq("organization_id", context.organizationId).single(),
      admin.from("provider_connections").select("provider,status,provider_account_label,granted_scopes,last_verified_at").eq("organization_id", context.organizationId).eq("provider", "google").neq("status", "revoked").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("capabilities").select("capability,status,activated_at").eq("organization_id", context.organizationId),
    ]);
    return { organization, profile, connection, capabilities: capability ?? [] };
  }

  if (name === "search_gmail") {
    const query = String(args.query ?? "").trim();
    if (!query) throw new Error("GMAIL_QUERY_REQUIRED");
    const max = Math.min(Math.max(Number(args.max_results ?? 10), 1), 20);
    const accessToken = await googleToken(context.organizationId);
    const list = await googleJson(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent(query)}`);
    if (!list.ok) throw new Error("GMAIL_SEARCH_FAILED");
    const messages = (list.body as GmailList).messages ?? [];
    const results = await Promise.all(messages.map(async ({ id }) => {
      const response = await googleJson(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`);
      if (!response.ok) return null;
      const message = response.body as GmailMessage;
      return {
        id: message.id,
        thread_id: message.threadId,
        subject: header(message, "Subject") || "No subject",
        from: header(message, "From"),
        to: header(message, "To"),
        date: header(message, "Date"),
        snippet: (message.snippet ?? "").replace(/\s+/g, " ").trim(),
        source_url: `https://mail.google.com/mail/u/0/#all/${message.threadId ?? message.id}`,
      };
    }));
    return { query, results: results.filter(Boolean) };
  }

  if (name === "list_calendar_events") {
    const timeMin = String(args.time_min ?? "");
    const timeMax = String(args.time_max ?? "");
    if (!timeMin || !timeMax) throw new Error("CALENDAR_WINDOW_REQUIRED");
    const max = Math.min(Math.max(Number(args.max_results ?? 15), 1), 30);
    const accessToken = await googleToken(context.organizationId);
    const response = await googleJson(accessToken, `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=${max}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`);
    if (!response.ok) throw new Error("CALENDAR_LIST_FAILED");
    return { time_min: timeMin, time_max: timeMax, events: (response.body as CalendarList).items ?? [] };
  }

  if (name === "get_latest_briefing") {
    const { data: briefing } = await admin.from("briefings").select("*").eq("organization_id", context.organizationId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (!briefing) return { briefing: null, items: [] };
    const { data: items } = await admin.from("briefing_items").select("*").eq("briefing_id", briefing.id).in("state", ["open", "snoozed"]).order("created_at");
    return { briefing, items: items ?? [] };
  }

  throw new Error("UNKNOWN_AGENT_TOOL");
}
