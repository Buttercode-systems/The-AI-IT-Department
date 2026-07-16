"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase";

type Memory = {
  id: string;
  memory_key: string;
  memory_value: unknown;
  category: string;
  is_active: boolean;
  updated_at: string;
};

type Automation = {
  id: string;
  name: string;
  instruction: string;
  schedule_type: "daily" | "weekly" | "manual";
  schedule_config: { hour?: number; minute?: number; weekday?: number };
  timezone: string;
  status: "active" | "paused" | "disabled";
  approval_mode: "always_ask" | "read_only_only";
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_error_code?: string | null;
  conversation_id?: string | null;
};

type Section = "overview" | "memory" | "automations" | "data";

function displayValue(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function scheduleLabel(automation: Automation) {
  if (automation.schedule_type === "manual") return "Manual workflow";
  const hour = String(automation.schedule_config.hour ?? 0).padStart(2, "0");
  const minute = String(automation.schedule_config.minute ?? 0).padStart(2, "0");
  if (automation.schedule_type === "daily") return `Daily at ${hour}:${minute}`;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${days[automation.schedule_config.weekday ?? 0]} at ${hour}:${minute}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function WorkspaceControls() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [section, setSection] = useState<Section>("overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sign in to continue.");
    return data.session.access_token;
  }, [supabase]);

  const api = useCallback(async <T,>(path: string, method: "GET" | "POST" | "PATCH" | "DELETE" = "GET", body?: unknown): Promise<T> => {
    const headers: Record<string, string> = { authorization: `Bearer ${await token()}` };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(path, init);
    const result = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(result.error?.replaceAll("_", " ") || "Request failed");
    return result;
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [memoryResult, automationResult] = await Promise.all([
        api<{ memories: Memory[] }>("/api/memories"),
        api<{ automations: Automation[] }>("/api/automations"),
      ]);
      setMemories(memoryResult.memories);
      setAutomations(automationResult.automations);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load controls.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function toggleMemory(memory: Memory) {
    setBusy(`memory-${memory.id}`);
    try {
      await api(`/api/memories/${memory.id}`, "PATCH", { is_active: !memory.is_active });
      await load();
      setNotice(memory.is_active ? "Memory disabled. AID will stop using it." : "Memory enabled. AID may use it in future conversations.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Memory update failed."); }
    finally { setBusy(null); }
  }

  async function deleteMemory(memory: Memory) {
    if (!window.confirm(`Forget “${titleCase(memory.memory_key)}”? AID will no longer use this information.`)) return;
    setBusy(`memory-${memory.id}`);
    try {
      await api(`/api/memories/${memory.id}`, "DELETE");
      await load();
      setNotice("Memory forgotten.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Memory deletion failed."); }
    finally { setBusy(null); }
  }

  async function automationAction(automation: Automation, action: "run" | "pause" | "resume" | "delete") {
    if (action === "delete" && !window.confirm(`Delete “${automation.name}”? This removes the workflow and its schedule.`)) return;
    setBusy(`automation-${automation.id}`);
    try {
      if (action === "run") await api(`/api/automations/${automation.id}/run`, "POST", {});
      else if (action === "delete") await api(`/api/automations/${automation.id}`, "DELETE");
      else await api(`/api/automations/${automation.id}`, "PATCH", { status: action === "pause" ? "paused" : "active" });
      await load();
      const messages = {
        run: "Workflow started. Its progress is saved in the linked conversation.",
        pause: "Workflow paused.",
        resume: "Workflow resumed.",
        delete: "Workflow deleted.",
      };
      setNotice(messages[action]);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Automation action failed."); }
    finally { setBusy(null); }
  }

  async function exportAccount() {
    setBusy("export");
    try {
      const response = await fetch("/api/account/export", { headers: { authorization: `Bearer ${await token()}` } });
      if (!response.ok) throw new Error("Account export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `aid-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Your account export has been downloaded.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Account export failed."); }
    finally { setBusy(null); }
  }

  async function deleteAccount() {
    const confirmation = window.prompt("This permanently deletes your AID account, workspace and stored data. Type DELETE to continue.");
    if (confirmation !== "DELETE") return;
    setBusy("delete-account");
    try {
      await api("/api/account/delete", "POST", {});
      await supabase.auth.signOut();
      window.location.assign("/");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Account deletion failed."); setBusy(null); }
  }

  const activeMemories = memories.filter((memory) => memory.is_active).length;
  const activeAutomations = automations.filter((automation) => automation.status === "active").length;
  const failedAutomations = automations.filter((automation) => Boolean(automation.last_error_code)).length;

  return (
    <section className="manage-shell">
      <nav className="manage-tabs" aria-label="Manage AID sections">
        {([
          ["overview", "Overview"],
          ["memory", "Memory"],
          ["automations", "Automations"],
          ["data", "Data & privacy"],
        ] as const).map(([value, label]) => (
          <button key={value} className={section === value ? "active" : ""} onClick={() => setSection(value)}>
            {label}
            {value === "memory" && memories.length > 0 ? <span>{memories.length}</span> : null}
            {value === "automations" && automations.length > 0 ? <span>{automations.length}</span> : null}
          </button>
        ))}
      </nav>

      <div className="manage-content">
        {section === "overview" && (
          <>
            <section className="manage-summary-grid" aria-label="AID control summary">
              <button className="summary-card" onClick={() => setSection("memory")}>
                <span className="summary-icon">M</span>
                <div><small>Active memory</small><strong>{activeMemories}</strong><p>{memories.length ? `${memories.length} saved facts and preferences` : "Nothing saved yet"}</p></div>
              </button>
              <button className="summary-card" onClick={() => setSection("automations")}>
                <span className="summary-icon">A</span>
                <div><small>Active workflows</small><strong>{activeAutomations}</strong><p>{automations.length ? `${automations.length} workflows in total` : "No workflows created"}</p></div>
              </button>
              <button className="summary-card" onClick={() => setSection("automations")}>
                <span className={`summary-icon ${failedAutomations ? "warning" : "ready"}`}>{failedAutomations ? "!" : "✓"}</span>
                <div><small>Workflow health</small><strong>{failedAutomations ? `${failedAutomations} issue${failedAutomations === 1 ? "" : "s"}` : "Clear"}</strong><p>{failedAutomations ? "Review the affected workflow" : "No recorded workflow failures"}</p></div>
              </button>
            </section>

            <section className="manage-panel">
              <div className="panel-heading"><div><span className="panel-kicker">How AID works</span><h2>Your controls, in one place</h2><p>AID only uses active memories. Scheduled workflows can be paused at any time. External actions still follow the approval rules configured for each workflow.</p></div></div>
              <div className="control-principles">
                <article><strong>You stay in control</strong><p>Disable a memory, pause a workflow or reject an approval without affecting the rest of your workspace.</p></article>
                <article><strong>Nothing is hidden</strong><p>Saved context and reusable workflows remain visible here so you can review what AID knows and does.</p></article>
                <article><strong>Your data is portable</strong><p>Download a structured account export whenever you need a copy of your AID data.</p></article>
              </div>
            </section>
          </>
        )}

        {section === "memory" && (
          <section className="manage-panel">
            <div className="panel-heading">
              <div><span className="panel-kicker">Context</span><h2>Memory</h2><p>Business facts and preferences AID may use to make future conversations more useful.</p></div>
              <button className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
            </div>
            <div className="control-list">
              {loading && !memories.length ? <div className="empty-control loading-control"><span></span><strong>Loading memory…</strong></div> : memories.length ? memories.map((memory) => (
                <article className={`control-row ${memory.is_active ? "" : "muted"}`} key={memory.id}>
                  <div className="control-main">
                    <div className="control-title-row"><strong>{titleCase(memory.memory_key)}</strong><span className={memory.is_active ? "status-pill active" : "status-pill paused"}>{memory.is_active ? "Active" : "Disabled"}</span></div>
                    <p>{displayValue(memory.memory_value)}</p>
                    <small>{titleCase(memory.category)} · Updated {formatDate(memory.updated_at)}</small>
                  </div>
                  <div className="control-actions">
                    <button disabled={busy === `memory-${memory.id}`} onClick={() => void toggleMemory(memory)}>{memory.is_active ? "Disable" : "Enable"}</button>
                    <button className="danger-text" disabled={busy === `memory-${memory.id}`} onClick={() => void deleteMemory(memory)}>Forget</button>
                  </div>
                </article>
              )) : <div className="empty-control"><span className="empty-mark">M</span><strong>No saved memories</strong><p>Tell AID “Remember that…” in a conversation to save a durable business fact or preference.</p><a href="/">Go to conversation</a></div>}
            </div>
          </section>
        )}

        {section === "automations" && (
          <section className="manage-panel">
            <div className="panel-heading">
              <div><span className="panel-kicker">Reusable work</span><h2>Automations</h2><p>Scheduled and manual workflows created through conversation.</p></div>
              <button className="secondary-button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
            </div>
            <div className="control-list">
              {loading && !automations.length ? <div className="empty-control loading-control"><span></span><strong>Loading workflows…</strong></div> : automations.length ? automations.map((automation) => (
                <article className={`control-row automation-row ${automation.status !== "active" ? "muted" : ""}`} key={automation.id}>
                  <div className="control-main">
                    <div className="control-title-row"><strong>{automation.name}</strong><span className={`status-pill ${automation.status}`}>{titleCase(automation.status)}</span></div>
                    <p>{automation.instruction}</p>
                    <div className="automation-meta"><span>{scheduleLabel(automation)}</span><span>{automation.timezone}</span><span>{automation.approval_mode === "always_ask" ? "Approval protected" : "Read only"}</span></div>
                    <div className="automation-timing"><small>Last run: {formatDate(automation.last_run_at)}</small><small>Next run: {formatDate(automation.next_run_at)}</small></div>
                    {automation.last_error_code && <div className="control-error"><strong>Last run needs attention</strong><span>{titleCase(automation.last_error_code)}</span></div>}
                  </div>
                  <div className="control-actions automation-actions">
                    <button className="primary-action" disabled={busy === `automation-${automation.id}`} onClick={() => void automationAction(automation, "run")}>{busy === `automation-${automation.id}` ? "Working…" : "Run now"}</button>
                    {automation.status === "active" ? <button disabled={busy === `automation-${automation.id}`} onClick={() => void automationAction(automation, "pause")}>Pause</button> : <button disabled={busy === `automation-${automation.id}`} onClick={() => void automationAction(automation, "resume")}>Resume</button>}
                    <button className="danger-text" disabled={busy === `automation-${automation.id}`} onClick={() => void automationAction(automation, "delete")}>Delete</button>
                  </div>
                </article>
              )) : <div className="empty-control"><span className="empty-mark">A</span><strong>No workflows yet</strong><p>Ask AID to repeat a task daily, weekly or whenever you choose to run it manually.</p><a href="/">Create one in conversation</a></div>}
            </div>
          </section>
        )}

        {section === "data" && (
          <section className="manage-panel data-panel">
            <div className="panel-heading"><div><span className="panel-kicker">Account controls</span><h2>Data & privacy</h2><p>Download your information, review policies or permanently remove your account.</p></div></div>

            <article className="account-control-card">
              <div className="account-control-icon">⇩</div>
              <div><strong>Export your AID data</strong><p>Download conversations, memories, automations, approvals and audit history as a structured JSON file. Connected-provider credentials are never included.</p></div>
              <button disabled={busy === "export"} onClick={() => void exportAccount()}>{busy === "export" ? "Preparing…" : "Download export"}</button>
            </article>

            <div className="privacy-links-grid">
              <a href="/privacy"><strong>Privacy policy</strong><span>How AID collects, uses and protects information →</span></a>
              <a href="/terms"><strong>Terms of use</strong><span>The conditions that apply when using AID →</span></a>
              <a href="/data-deletion"><strong>Data deletion</strong><span>What is removed and how deletion works →</span></a>
            </div>

            <article className="danger-zone">
              <div><span className="panel-kicker danger-kicker">Permanent action</span><strong>Delete AID account</strong><p>This permanently deletes the workspace and authentication account. This cannot be undone. A final typed confirmation is required.</p></div>
              <button disabled={busy === "delete-account"} onClick={() => void deleteAccount()}>{busy === "delete-account" ? "Deleting…" : "Delete account"}</button>
            </article>
          </section>
        )}
      </div>

      {notice && <div className="control-notice" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
    </section>
  );
}
