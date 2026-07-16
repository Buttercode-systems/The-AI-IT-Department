import { createApproval } from "./agent-approvals";
import { createSupabaseAdminClient } from "./server-supabase";
import { getGoogleAccessToken, getGoogleConnection, googleJson, googleRequest } from "./google-connection";

type ToolContext = { organizationId: string; userId: string; conversationId: string };
type GmailList = { messages?: Array<{ id: string; threadId?: string }> };
type GmailMessage = { id: string; threadId?: string; snippet?: string; internalDate?: string; payload?: { headers?: Array<{ name: string; value: string }> } };
type GmailThread = { id: string; messages?: GmailMessage[] };
type CalendarList = { items?: Array<Record<string, unknown>> };
type DriveList = { files?: Array<Record<string, unknown>> };

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: "function",
  function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } },
});

export const agentTools = [
  fn("get_workspace_context", "Get the business profile, Google connection, scopes and capability status.", {}),
  fn("search_gmail", "Search Gmail with Gmail query syntax and return source-backed message summaries.", {
    query: { type: "string" }, max_results: { type: "integer", minimum: 1, maximum: 20 },
  }, ["query"]),
  fn("get_gmail_thread", "Read the metadata and snippets for every message in a Gmail thread.", { thread_id: { type: "string" } }, ["thread_id"]),
  fn("create_gmail_draft", "Create a private Gmail draft. This does not send the email and does not require approval.", {
    to: { type: "string" }, cc: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, thread_id: { type: "string" },
  }, ["to", "subject", "body"]),
  fn("propose_send_email", "Prepare an email send for explicit user approval. Never claim it was sent until approval executes.", {
    to: { type: "string" }, cc: { type: "string" }, subject: { type: "string" }, body: { type: "string" }, thread_id: { type: "string" },
  }, ["to", "subject", "body"]),
  fn("list_calendar_events", "List primary-calendar events in an ISO time window.", {
    time_min: { type: "string" }, time_max: { type: "string" }, max_results: { type: "integer", minimum: 1, maximum: 30 },
  }, ["time_min", "time_max"]),
  fn("propose_create_calendar_event", "Prepare a calendar event for approval.", {
    summary: { type: "string" }, description: { type: "string" }, location: { type: "string" }, start: { type: "object" }, end: { type: "object" }, attendees: { type: "array", items: { type: "object" } },
  }, ["summary", "start", "end"]),
  fn("propose_update_calendar_event", "Prepare changes to an existing event for approval.", {
    event_id: { type: "string" }, summary: { type: "string" }, description: { type: "string" }, location: { type: "string" }, start: { type: "object" }, end: { type: "object" }, attendees: { type: "array", items: { type: "object" } },
  }, ["event_id"]),
  fn("propose_delete_calendar_event", "Prepare cancellation of an event for high-risk approval.", { event_id: { type: "string" }, event_title: { type: "string" } }, ["event_id"]),
  fn("search_drive", "Search Google Drive files by name or full-text query.", { query: { type: "string" }, max_results: { type: "integer", minimum: 1, maximum: 30 } }, ["query"]),
  fn("read_drive_file", "Read metadata and text from a Google Docs file or return metadata and a web link for other supported files.", { file_id: { type: "string" } }, ["file_id"]),
  fn("propose_share_drive_file", "Prepare sharing a Drive file with a person for explicit approval.", {
    file_id: { type: "string" }, file_name: { type: "string" }, email_address: { type: "string" }, role: { type: "string", enum: ["reader", "commenter", "writer"] },
  }, ["file_id", "email_address"]),
  fn("get_latest_briefing", "Get the latest daily briefing and open action items.", {}),
] as const;

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function googleToken(organizationId: string) {
  const connection = await getGoogleConnection(organizationId);
  return getGoogleAccessToken(connection);
}

function base64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function emailRaw(args: Record<string, unknown>) {
  const headers = [
    `To: ${String(args.to ?? "")}`,
    args.cc ? `Cc: ${String(args.cc)}` : "",
    `Subject: ${String(args.subject ?? "")}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean);
  return base64url(`${headers.join("\r\n")}\r\n\r\n${String(args.body ?? "")}`);
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
      return { id: message.id, thread_id: message.threadId, subject: header(message, "Subject") || "No subject", from: header(message, "From"), to: header(message, "To"), date: header(message, "Date"), snippet: (message.snippet ?? "").replace(/\s+/g, " ").trim(), source_url: `https://mail.google.com/mail/u/0/#all/${message.threadId ?? message.id}` };
    }));
    return { query, results: results.filter(Boolean) };
  }

  if (name === "get_gmail_thread") {
    const threadId = String(args.thread_id ?? "");
    if (!threadId) throw new Error("THREAD_ID_REQUIRED");
    const accessToken = await googleToken(context.organizationId);
    const response = await googleJson(accessToken, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`);
    if (!response.ok) throw new Error("GMAIL_THREAD_FAILED");
    const thread = response.body as GmailThread;
    return { id: thread.id, source_url: `https://mail.google.com/mail/u/0/#all/${thread.id}`, messages: (thread.messages ?? []).map((message) => ({ id: message.id, from: header(message, "From"), to: header(message, "To"), subject: header(message, "Subject"), date: header(message, "Date"), snippet: message.snippet ?? "" })) };
  }

  if (name === "create_gmail_draft") {
    const accessToken = await googleToken(context.organizationId);
    const message: Record<string, unknown> = { raw: emailRaw(args) };
    if (args.thread_id) message.threadId = String(args.thread_id);
    const response = await googleRequest(accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/drafts", { method: "POST", body: { message } });
    if (!response.ok) throw new Error(`GMAIL_DRAFT_FAILED_${response.status}`);
    await admin.from("audit_events").insert({ organization_id: context.organizationId, actor_user_id: context.userId, source: "assistant", tool_name: name, provider: "google", resource_type: "gmail_draft", operation: "create", result: "success" });
    return { draft: response.body, status: "created", note: "Draft created but not sent." };
  }

  if (name === "propose_send_email") {
    const approval = await createApproval("send_gmail", args, `Send email to ${String(args.to)}: ${String(args.subject)}`, "high", context);
    return { approval_required: true, approval };
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

  if (name === "propose_create_calendar_event") {
    const approval = await createApproval("create_calendar_event", args, `Create calendar event: ${String(args.summary)}`, "high", context);
    return { approval_required: true, approval };
  }
  if (name === "propose_update_calendar_event") {
    const approval = await createApproval("update_calendar_event", args, `Update calendar event ${String(args.event_id)}`, "high", context);
    return { approval_required: true, approval };
  }
  if (name === "propose_delete_calendar_event") {
    const approval = await createApproval("delete_calendar_event", args, `Cancel calendar event: ${String(args.event_title ?? args.event_id)}`, "critical", context);
    return { approval_required: true, approval };
  }

  if (name === "search_drive") {
    const query = String(args.query ?? "").trim();
    if (!query) throw new Error("DRIVE_QUERY_REQUIRED");
    const max = Math.min(Math.max(Number(args.max_results ?? 15), 1), 30);
    const accessToken = await googleToken(context.organizationId);
    const q = `trashed = false and (name contains '${query.replaceAll("'", "\\'")}' or fullText contains '${query.replaceAll("'", "\\'")}')`;
    const response = await googleJson(accessToken, `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=${max}&fields=files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName,emailAddress))&orderBy=modifiedTime%20desc`);
    if (!response.ok) throw new Error(`DRIVE_SEARCH_FAILED_${response.status}`);
    return { query, files: (response.body as DriveList).files ?? [] };
  }

  if (name === "read_drive_file") {
    const fileId = String(args.file_id ?? "");
    if (!fileId) throw new Error("FILE_ID_REQUIRED");
    const accessToken = await googleToken(context.organizationId);
    const metadata = await googleJson(accessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,modifiedTime,webViewLink,size,owners(displayName,emailAddress)`);
    if (!metadata.ok) throw new Error(`DRIVE_FILE_FAILED_${metadata.status}`);
    const file = metadata.body as Record<string, unknown>;
    if (file.mimeType === "application/vnd.google-apps.document") {
      const textResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text%2Fplain`, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const text = textResponse.ok ? (await textResponse.text()).slice(0, 40_000) : "";
      return { file, text };
    }
    return { file, note: "Open the webViewLink to inspect this file type." };
  }

  if (name === "propose_share_drive_file") {
    const approval = await createApproval("share_drive_file", args, `Share ${String(args.file_name ?? "Drive file")} with ${String(args.email_address)}`, "high", context);
    return { approval_required: true, approval };
  }

  if (name === "get_latest_briefing") {
    const { data: briefing } = await admin.from("briefings").select("*").eq("organization_id", context.organizationId).order("generated_at", { ascending: false }).limit(1).maybeSingle();
    if (!briefing) return { briefing: null, items: [] };
    const { data: items } = await admin.from("briefing_items").select("*").eq("briefing_id", briefing.id).in("state", ["open", "snoozed"]).order("created_at");
    return { briefing, items: items ?? [] };
  }

  throw new Error("UNKNOWN_AGENT_TOOL");
}
