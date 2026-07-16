import { createHash, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "./server-supabase";
import { getGoogleAccessToken, getGoogleConnection, googleRequest } from "./google-connection";

export type ApprovalAction =
  | "send_gmail"
  | "create_calendar_event"
  | "update_calendar_event"
  | "delete_calendar_event"
  | "share_drive_file";

type ApprovalContext = {
  organizationId: string;
  userId: string;
  conversationId: string;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export async function createApproval(
  action: ApprovalAction,
  args: Record<string, unknown>,
  summary: string,
  riskLevel: "medium" | "high" | "critical",
  context: ApprovalContext,
) {
  const admin = createSupabaseAdminClient();
  const payloadHash = hash({ action, args });
  const idempotencyKey = `${action}:${payloadHash}`;
  const { data: existing } = await admin
    .from("agent_approvals")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("idempotency_key", idempotencyKey)
    .in("status", ["pending", "approved", "executing", "executed"])
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await admin.from("agent_approvals").insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    conversation_id: context.conversationId,
    tool_name: action,
    arguments: args,
    summary,
    risk_level: riskLevel,
    status: "pending",
    provider: "google",
    payload_hash: payloadHash,
    idempotency_key: idempotencyKey,
  }).select("*").single();
  if (error || !data) throw new Error("APPROVAL_CREATE_FAILED");
  return data;
}

function base64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function emailRaw(args: Record<string, unknown>) {
  const to = String(args.to ?? "").trim();
  const subject = String(args.subject ?? "").trim();
  const body = String(args.body ?? "");
  if (!to || !subject || !body) throw new Error("EMAIL_FIELDS_REQUIRED");
  const headers = [
    `To: ${to}`,
    args.cc ? `Cc: ${String(args.cc)}` : "",
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean);
  return base64url(`${headers.join("\r\n")}\r\n\r\n${body}`);
}

async function executeGoogleAction(action: ApprovalAction, args: Record<string, unknown>, organizationId: string) {
  const connection = await getGoogleConnection(organizationId);
  const accessToken = await getGoogleAccessToken(connection);

  if (action === "send_gmail") {
    const threadId = args.thread_id ? String(args.thread_id) : undefined;
    const body: Record<string, unknown> = { raw: emailRaw(args) };
    if (threadId) body.threadId = threadId;
    const response = await googleRequest(accessToken, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", body });
    if (!response.ok) throw new Error(`GMAIL_SEND_FAILED_${response.status}`);
    return response.body;
  }

  if (action === "create_calendar_event") {
    const response = await googleRequest(accessToken, "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", { method: "POST", body: args });
    if (!response.ok) throw new Error(`CALENDAR_CREATE_FAILED_${response.status}`);
    return response.body;
  }

  if (action === "update_calendar_event") {
    const eventId = String(args.event_id ?? "");
    if (!eventId) throw new Error("EVENT_ID_REQUIRED");
    const { event_id: _eventId, ...event } = args;
    const response = await googleRequest(accessToken, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "PATCH", body: event });
    if (!response.ok) throw new Error(`CALENDAR_UPDATE_FAILED_${response.status}`);
    return response.body;
  }

  if (action === "delete_calendar_event") {
    const eventId = String(args.event_id ?? "");
    if (!eventId) throw new Error("EVENT_ID_REQUIRED");
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`CALENDAR_DELETE_FAILED_${response.status}`);
    return { deleted: true, event_id: eventId };
  }

  if (action === "share_drive_file") {
    const fileId = String(args.file_id ?? "");
    const emailAddress = String(args.email_address ?? "");
    if (!fileId || !emailAddress) throw new Error("DRIVE_SHARE_FIELDS_REQUIRED");
    const response = await googleRequest(accessToken, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=true`, {
      method: "POST",
      body: { type: "user", role: String(args.role ?? "reader"), emailAddress },
    });
    if (!response.ok) throw new Error(`DRIVE_SHARE_FAILED_${response.status}`);
    return response.body;
  }

  throw new Error("UNSUPPORTED_APPROVAL_ACTION");
}

export async function decideAndExecuteApproval(
  approvalId: string,
  decision: "approve" | "reject",
  context: { organizationId: string; userId: string },
) {
  const admin = createSupabaseAdminClient();
  const { data: approval } = await admin.from("agent_approvals").select("*")
    .eq("id", approvalId)
    .eq("organization_id", context.organizationId)
    .eq("user_id", context.userId)
    .single();
  if (!approval) throw new Error("APPROVAL_NOT_FOUND");
  if (approval.status === "executed") return approval;
  if (approval.status !== "pending") throw new Error("APPROVAL_NOT_PENDING");
  if (new Date(approval.expires_at).getTime() <= Date.now()) {
    await admin.from("agent_approvals").update({ status: "expired", decided_at: new Date().toISOString() }).eq("id", approval.id);
    throw new Error("APPROVAL_EXPIRED");
  }
  if (hash({ action: approval.tool_name, args: approval.arguments }) !== approval.payload_hash) throw new Error("APPROVAL_PAYLOAD_CHANGED");

  if (decision === "reject") {
    const { data } = await admin.from("agent_approvals").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", approval.id).select("*").single();
    return data;
  }

  const lockedAt = new Date().toISOString();
  const { data: locked, error: lockError } = await admin.from("agent_approvals")
    .update({ status: "executing", decided_at: lockedAt, last_attempt_at: lockedAt, execution_attempts: Number(approval.execution_attempts ?? 0) + 1 })
    .eq("id", approval.id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (lockError || !locked) throw new Error("APPROVAL_ALREADY_CLAIMED");

  try {
    const result = await executeGoogleAction(locked.tool_name as ApprovalAction, locked.arguments as Record<string, unknown>, context.organizationId);
    const executedAt = new Date().toISOString();
    const { data } = await admin.from("agent_approvals").update({ status: "executed", result, executed_at: executedAt, error_code: null }).eq("id", approval.id).select("*").single();
    await admin.from("audit_events").insert({
      organization_id: context.organizationId,
      actor_user_id: context.userId,
      source: "assistant",
      tool_name: locked.tool_name,
      provider: "google",
      resource_type: "approved_action",
      resource_id: approval.id,
      operation: "execute",
      result: "success",
      metadata: { idempotency_key: locked.idempotency_key },
    });
    return data;
  } catch (error) {
    const code = error instanceof Error ? error.message : "APPROVAL_EXECUTION_FAILED";
    await admin.from("agent_approvals").update({ status: "failed", error_code: code }).eq("id", approval.id);
    await admin.from("audit_events").insert({
      organization_id: context.organizationId,
      actor_user_id: context.userId,
      source: "assistant",
      tool_name: locked.tool_name,
      provider: "google",
      resource_type: "approved_action",
      resource_id: approval.id,
      operation: "execute",
      result: "error",
      error_code: code,
    });
    throw error;
  }
}

export function newIdempotencySeed() {
  return randomUUID();
}
