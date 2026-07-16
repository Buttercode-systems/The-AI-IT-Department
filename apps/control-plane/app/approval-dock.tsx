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

function detailLines(approval: Approval) {
  const args = approval.arguments;
  if (approval.tool_name === "send_gmail") {
    return [
      `To: ${String(args.to ?? "")}`,
      args.cc ? `Cc: ${String(args.cc)}` : "",
      `Subject: ${String(args.subject ?? "")}`,
      String(args.body ?? ""),
    ].filter(Boolean);
  }
  if (approval.tool_name.includes("calendar")) {
    return [
      args.summary ? `Event: ${String(args.summary)}` : "",
      args.start ? `Start: ${JSON.stringify(args.start)}` : "",
      args.end ? `End: ${JSON.stringify(args.end)}` : "",
      args.location ? `Location: ${String(args.location)}` : "",
      args.event_id ? `Event ID: ${String(args.event_id)}` : "",
    ].filter(Boolean);
  }
  if (approval.tool_name === "share_drive_file") {
    return [
      `File: ${String(args.file_name ?? args.file_id ?? "")}`,
      `Share with: ${String(args.email_address ?? "")}`,
      `Access: ${String(args.role ?? "reader")}`,
    ];
  }
  return [JSON.stringify(args, null, 2)];
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
    const response = await fetch("/api/approvals", { headers: { authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { approvals: Approval[] };
    setApprovals(result.approvals.filter((item) => ["pending", "executing", "failed"].includes(item.status)));
  }, [supabase]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 5000);
    const { data } = supabase.auth.onAuthStateChange(() => void load());
    return () => { window.clearInterval(interval); data.subscription.unsubscribe(); };
  }, [load, supabase]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id); setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Sign in again to continue.");
      const response = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const result = await response.json() as { approval?: Approval; error?: string };
      if (!response.ok) throw new Error(result.error?.replaceAll("_", " ") || "Action failed");
      setMessage(decision === "approve" ? "Action completed and verified." : "Action rejected.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!approvals.length && !message) return null;

  return (
    <aside className="approval-dock" aria-live="polite">
      <div className="approval-dock-header"><strong>AID approvals</strong><span>{approvals.length || ""}</span></div>
      {message && <p className="approval-dock-message">{message}</p>}
      {approvals.map((approval) => <article className={`approval-card risk-${approval.risk_level}`} key={approval.id}>
        <div className="approval-card-top"><span>{approval.risk_level} risk</span><small>{approval.status}</small></div>
        <h3>{approval.summary}</h3>
        <div className="approval-details">{detailLines(approval).map((line, index) => <p key={`${approval.id}-${index}`}>{line}</p>)}</div>
        <small>Expires {new Date(approval.expires_at).toLocaleString()}</small>
        {approval.error_code && <p className="approval-error">{approval.error_code.replaceAll("_", " ")}</p>}
        {approval.status === "pending" && <div className="approval-actions">
          <button onClick={() => void decide(approval.id, "reject")} disabled={busyId === approval.id}>Reject</button>
          <button className="approve" onClick={() => void decide(approval.id, "approve")} disabled={busyId === approval.id}>{busyId === approval.id ? "Executing…" : "Approve & execute"}</button>
        </div>}
      </article>)}
    </aside>
  );
}
