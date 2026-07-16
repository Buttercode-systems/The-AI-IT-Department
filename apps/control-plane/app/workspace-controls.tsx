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

function displayValue(value: unknown) {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function scheduleLabel(automation: Automation) {
  if (automation.schedule_type === "manual") return "Manual workflow";
  const hour = String(automation.schedule_config.hour ?? 0).padStart(2, "0");
  const minute = String(automation.schedule_config.minute ?? 0).padStart(2, "0");
  if (automation.schedule_type === "daily") return `Daily at ${hour}:${minute}`;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${days[automation.schedule_config.weekday ?? 0]} at ${hour}:${minute}`;
}

export default function WorkspaceControls() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

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
    try {
      const [memoryResult, automationResult] = await Promise.all([
        api<{ memories: Memory[] }>("/api/memories"),
        api<{ automations: Automation[] }>("/api/automations"),
      ]);
      setMemories(memoryResult.memories);
      setAutomations(automationResult.automations);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load controls.");
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  async function toggleMemory(memory: Memory) {
    setBusy(`memory-${memory.id}`);
    try {
      await api(`/api/memories/${memory.id}`, "PATCH", { is_active: !memory.is_active });
      await load();
      setNotice(memory.is_active ? "Memory disabled." : "Memory enabled.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Memory update failed."); }
    finally { setBusy(null); }
  }

  async function deleteMemory(memory: Memory) {
    if (!window.confirm(`Forget “${memory.memory_key}”?`)) return;
    setBusy(`memory-${memory.id}`);
    try {
      await api(`/api/memories/${memory.id}`, "DELETE");
      await load();
      setNotice("Memory deleted.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Memory deletion failed."); }
    finally { setBusy(null); }
  }

  async function automationAction(automation: Automation, action: "run" | "pause" | "resume" | "delete") {
    if (action === "delete" && !window.confirm(`Delete “${automation.name}”?`)) return;
    setBusy(`automation-${automation.id}`);
    try {
      if (action === "run") await api(`/api/automations/${automation.id}/run`, "POST", {});
      else if (action === "delete") await api(`/api/automations/${automation.id}`, "DELETE");
      else await api(`/api/automations/${automation.id}`, "PATCH", { status: action === "pause" ? "paused" : "active" });
      await load();
      setNotice(action === "run" ? "Automation run started and saved to its conversation." : `Automation ${action}d.`);
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
      setNotice("Account export downloaded.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Account export failed."); }
    finally { setBusy(null); }
  }

  async function deleteAccount() {
    const confirmation = window.prompt("This permanently deletes your AID account and workspace. Type DELETE to continue.");
    if (confirmation !== "DELETE") return;
    setBusy("delete-account");
    try {
      await api("/api/account/delete", "POST", {});
      await supabase.auth.signOut();
      window.location.assign("/");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Account deletion failed."); setBusy(null); }
  }

  return <>
    <section className="settings-section"><div className="section-heading"><div><h2>Memory</h2><p>Visible business facts and preferences AID may use in future conversations.</p></div><button onClick={() => void load()}>Refresh</button></div><div className="control-list">{memories.length ? memories.map((memory) => <article className="control-row" key={memory.id}><div><strong>{memory.memory_key.replaceAll("_", " ")}</strong><p>{displayValue(memory.memory_value)}</p><small>{memory.category} · {memory.is_active ? "Active" : "Disabled"}</small></div><div className="control-actions"><button disabled={busy === `memory-${memory.id}`} onClick={() => void toggleMemory(memory)}>{memory.is_active ? "Disable" : "Enable"}</button><button className="danger" disabled={busy === `memory-${memory.id}`} onClick={() => void deleteMemory(memory)}>Forget</button></div></article>) : <div className="empty-control"><strong>No saved memories</strong><p>Tell AID “Remember that…” to save a durable business fact.</p></div>}</div></section>

    <section className="settings-section"><div className="section-heading"><div><h2>Automations</h2><p>Scheduled and reusable workflows created through conversation.</p></div><button onClick={() => void load()}>Refresh</button></div><div className="control-list">{automations.length ? automations.map((automation) => <article className="control-row" key={automation.id}><div><strong>{automation.name}</strong><p>{automation.instruction}</p><small>{scheduleLabel(automation)} · {automation.timezone} · {automation.status} · {automation.approval_mode === "always_ask" ? "Approvals allowed" : "Read only"}</small>{automation.last_error_code && <small className="control-error">Last error: {automation.last_error_code.replaceAll("_", " ")}</small>}</div><div className="control-actions"><button disabled={busy === `automation-${automation.id}`} onClick={() => void automationAction(automation, "run")}>Run now</button>{automation.status === "active" ? <button disabled={busy === `automation-${automation.id}`} onClick={() => void automationAction(automation, "pause")}>Pause</button> : <button disabled={busy === `automation-${automation.id}`} onClick={() => void automationAction(automation, "resume")}>Resume</button>}<button className="danger" disabled={busy === `automation-${automation.id}`} onClick={() => void automationAction(automation, "delete")}>Delete</button></div></article>) : <div className="empty-control"><strong>No automations yet</strong><p>Ask AID to run a task daily, weekly or as a reusable manual workflow.</p></div>}</div></section>

    <section className="settings-section"><h2>Data and account</h2><div className="account-controls"><div><strong>Export your data</strong><p>Download conversations, memories, automations, approvals and audit history. Provider credentials are excluded.</p></div><button disabled={busy === "export"} onClick={() => void exportAccount()}>Download export</button></div><div className="account-controls danger-zone"><div><strong>Delete AID account</strong><p>Permanently delete the workspace and authentication account. This cannot be undone.</p></div><button disabled={busy === "delete-account"} onClick={() => void deleteAccount()}>Delete account</button></div><nav className="legal-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/data-deletion">Data deletion</a></nav></section>
    {notice && <div className="control-notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}
  </>;
}
