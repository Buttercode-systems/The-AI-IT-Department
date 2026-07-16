"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase";

type Approval = {
  id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  summary: string;
  risk_level: "medium" | "high" | "critical";
  status: "pending" | "approved" | "rejected" | "executing" | "executed" | "failed" | "expired";
  result?: Record<string, unknown> | null;
  error_code?: string | null;
  expires_at: string;
};

type ApprovalDetail = {
  label: string;
  value: string;
  long?: boolean;
};

const riskCopy = {
  medium: {
    label: "Review required",
    explanation: "This action changes something in your connected workspace.",
  },
  high: {
    label: "High-impact action",
    explanation: "Check the recipients, dates and content carefully before continuing.",
  },
  critical: {
    label: "Sensitive action",
    explanation: "This action may be difficult to reverse. Approve only when every detail is correct.",
  },
} as const;

function stringifyValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function formatDateTime(value: unknown) {
  if (!value) return "Not provided";
  if (typeof value === "object" && value && "dateTime" in value) {
    return formatDateTime((value as { dateTime?: unknown }).dateTime);
  }
  if (typeof value === "object" && value && "date" in value) {
    return formatDateTime((value as { date?: unknown }).date);
  }
  const text = String(value);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: text.includes("T") ? "short" : undefined,
  }).format(date);
}

function actionName(toolName: string) {
  const names: Record<string, string> = {
    send_gmail: "Send email",
    create_calendar_event: "Create calendar event",
    update_calendar_event: "Update calendar event",
    delete_calendar_event: "Delete calendar event",
    share_drive_file: "Share Drive file",
  };
  return names[toolName] ?? toolName.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function approvalDetails(approval: Approval): ApprovalDetail[] {
  const args = approval.arguments;

  if (approval.tool_name === "send_gmail") {
    return [
      { label: "To", value: stringifyValue(args.to) },
      ...(args.cc ? [{ label: "Cc", value: stringifyValue(args.cc) }] : []),
      ...(args.bcc ? [{ label: "Bcc", value: stringifyValue(args.bcc) }] : []),
      { label: "Subject", value: stringifyValue(args.subject) },
      { label: "Message", value: stringifyValue(args.body), long: true },
    ];
  }

  if (approval.tool_name.includes("calendar")) {
    return [
      ...(args.summary ? [{ label: "Event", value: stringifyValue(args.summary) }] : []),
      ...(args.start ? [{ label: "Starts", value: formatDateTime(args.start) }] : []),
      ...(args.end ? [{ label: "Ends", value: formatDateTime(args.end) }] : []),
      ...(args.location ? [{ label: "Location", value: stringifyValue(args.location) }] : []),
      ...(args.attendees ? [{ label: "Guests", value: stringifyValue(args.attendees) }] : []),
      ...(args.event_id ? [{ label: "Calendar item", value: stringifyValue(args.event_id) }] : []),
    ];
  }

  if (approval.tool_name === "share_drive_file") {
    return [
      { label: "File", value: stringifyValue(args.file_name ?? args.file_id) },
      { label: "Share with", value: stringifyValue(args.email_address) },
      { label: "Access", value: stringifyValue(args.role ?? "Viewer") },
    ];
  }

  return Object.entries(args).map(([key, value]) => ({
    label: key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
    value: stringifyValue(value),
    long: typeof value === "object" || String(value).length > 120,
  }));
}

function statusCopy(status: Approval["status"]) {
  if (status === "executing") return "AID is carrying out this approved action…";
  if (status === "failed") return "The action was not completed. Nothing else was changed.";
  return "Waiting for your decision";
}

export default function ApprovalDock() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      setApprovals([]);
      return;
    }
    const response = await fetch("/api/approvals", {
      headers: { authorization: `Bearer ${data.session.access_token}` },
      cache: "no-store",
    });
    if (!response.ok) return;
    const result = await response.json() as { approvals: Approval[] };
    setApprovals(result.approvals.filter((item) => ["pending", "executing", "failed"].includes(item.status)));
  }, [supabase]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 5000);
    const { data } = supabase.auth.onAuthStateChange(() => void load());
    return () => {
      window.clearInterval(interval);
      data.subscription.unsubscribe();
    };
  }, [load, supabase]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Your session has expired. Sign in again to continue.");
      const response = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${data.session.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ decision }),
      });
      const result = await response.json() as { approval?: Approval; error?: string };
      if (!response.ok) throw new Error(result.error?.replaceAll("_", " ") || "The action could not be completed.");
      setMessage(decision === "approve" ? "Done. AID completed and verified the action." : "The action was rejected. Nothing was changed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The action could not be completed.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!approvals.length && !message) return null;

  return (
    <aside className="approval-dock" aria-label="Actions awaiting approval" aria-live="polite">
      <header className="approval-dock-header">
        <div>
          <span className="approval-eyebrow">Your review</span>
          <strong>{approvals.length === 1 ? "1 action needs approval" : `${approvals.length} actions need approval`}</strong>
        </div>
        {approvals.length > 0 && <span className="approval-count" aria-hidden="true">{approvals.length}</span>}
      </header>

      {message && (
        <div className="approval-feedback" role="status">
          <span aria-hidden="true">✓</span>
          <p>{message}</p>
          <button type="button" onClick={() => setMessage("")} aria-label="Dismiss message">×</button>
        </div>
      )}

      <div className="approval-list">
        {approvals.map((approval) => {
          const risk = riskCopy[approval.risk_level];
          const details = approvalDetails(approval);
          const isBusy = busyId === approval.id || approval.status === "executing";

          return (
            <article className={`approval-card risk-${approval.risk_level}`} key={approval.id}>
              <div className="approval-card-heading">
                <div className="approval-action-icon" aria-hidden="true">A</div>
                <div>
                  <span>{actionName(approval.tool_name)}</span>
                  <h3>{approval.summary}</h3>
                </div>
              </div>

              <div className={`approval-risk-note risk-note-${approval.risk_level}`}>
                <strong>{risk.label}</strong>
                <p>{risk.explanation}</p>
              </div>

              <dl className="approval-details">
                {details.map((detail, index) => (
                  <div className={detail.long ? "approval-detail approval-detail-long" : "approval-detail"} key={`${approval.id}-${detail.label}-${index}`}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.long ? <pre>{detail.value}</pre> : detail.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="approval-meta">
                <span className={`approval-state state-${approval.status}`}>{statusCopy(approval.status)}</span>
                <span>Expires {formatDateTime(approval.expires_at)}</span>
              </div>

              {approval.error_code && (
                <div className="approval-error" role="alert">
                  <strong>Action failed</strong>
                  <span>{approval.error_code.replaceAll("_", " ")}</span>
                </div>
              )}

              {approval.status === "pending" && (
                <div className="approval-actions">
                  <button type="button" onClick={() => void decide(approval.id, "reject")} disabled={isBusy}>
                    Do not proceed
                  </button>
                  <button type="button" className="approve" onClick={() => void decide(approval.id, "approve")} disabled={isBusy}>
                    {isBusy ? <><span className="button-spinner" aria-hidden="true" />Working…</> : "Approve action"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {approvals.length > 0 && <p className="approval-trust-copy">AID will only perform the action shown above. You can reject it without affecting the conversation.</p>}
    </aside>
  );
}
