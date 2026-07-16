"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabase";

type Workspace = {
  organization_id: string;
  organization_name: string;
  stage: string;
  profile_complete: boolean;
  google_status: string | null;
};

type LiveStatus = {
  connection: { id: string; status: string; provider_account_label?: string; last_verified_at?: string } | null;
  latestTest: { status: string; gmail_ok: boolean; calendar_ok: boolean; scopes_ok: boolean; created_at: string } | null;
  capability: { status: string; activated_at?: string; config?: { preview?: { unread_messages: number; today_events: number } } } | null;
};

export default function HomePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveStatus>({ connection: null, latestTest: null, capability: null });
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "google") setMessage("Google Workspace connected successfully. Run checks to verify Gmail and Calendar access.");
    const error = params.get("error");
    if (error) setMessage(`Connection error: ${error.replaceAll("_", " ")}`);
    if (params.size) window.history.replaceState({}, "", window.location.pathname);

    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!user) return;
    void loadAll();
  }, [user]);

  async function accessToken() {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) throw new Error("Your session has expired. Sign in again.");
    return token;
  }

  async function api(path: string, method: "GET" | "POST" = "POST") {
    const token = await accessToken();
    const response = await fetch(path, { method, headers: { authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error((result as { error?: string }).error?.replaceAll("_", " ") ?? "Request failed");
    return result;
  }

  async function loadAll() {
    const { data, error } = await supabase.rpc("get_or_create_workspace", { requested_name: null });
    if (error) {
      setMessage(error.message);
      return;
    }
    const nextWorkspace = Array.isArray(data) ? data[0] : data;
    setWorkspace(nextWorkspace);
    setBusinessName(nextWorkspace?.organization_name ?? "");
    try {
      setLiveStatus(await api("/api/workspace/status", "GET") as LiveStatus);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load connection status.");
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusyAction("signin");
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setBusyAction(null);
    setMessage(error ? error.message : "Check your email for the secure sign-in link.");
  }

  async function saveWorkspace(event: FormEvent) {
    event.preventDefault();
    setBusyAction("workspace");
    const { data, error } = await supabase.rpc("get_or_create_workspace", { requested_name: businessName });
    setBusyAction(null);
    if (error) setMessage(error.message);
    else {
      setWorkspace(Array.isArray(data) ? data[0] : data);
      setMessage("Workspace saved.");
    }
  }

  async function connectGoogle() {
    setBusyAction("connect");
    setMessage("");
    try {
      const result = await api("/api/connect/google") as { url: string };
      window.location.assign(result.url);
    } catch (error) {
      setBusyAction(null);
      setMessage(error instanceof Error ? error.message : "Could not start Google connection.");
    }
  }

  async function runChecks() {
    setBusyAction("checks");
    setMessage("Checking Gmail, Calendar and granted permissions…");
    try {
      const result = await api("/api/connections/google/check") as { passed: boolean };
      await loadAll();
      setMessage(result.passed ? "All checks passed. Gmail and Calendar read access are working." : "One or more checks failed. Reconnect Google and try again.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connection checks failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function activateBriefing() {
    setBusyAction("activate");
    setMessage("Activating your daily briefing and generating a live preview…");
    try {
      const result = await api("/api/capabilities/daily-briefing/activate") as { preview: { unread_messages: number; today_events: number } };
      await loadAll();
      setMessage(`Daily briefing activated. Preview: ${result.preview.unread_messages} unread messages and ${result.preview.today_events} events today.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Capability activation failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function disconnectGoogle() {
    if (!window.confirm("Disconnect Google and deactivate capabilities that use it?")) return;
    setBusyAction("disconnect");
    try {
      await api("/api/connections/google/disconnect");
      await loadAll();
      setMessage("Google disconnected and its stored tokens were removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disconnect Google.");
    } finally {
      setBusyAction(null);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setWorkspace(null);
    setLiveStatus({ connection: null, latestTest: null, capability: null });
  }

  if (!user) {
    return (
      <main className="shell">
        <section className="hero"><span className="eyebrow">THE AI IT DEPARTMENT</span><h1>Your business tools, connected to AI without the setup headache.</h1><p>Sign in to create your private workspace, connect your own accounts, verify permissions and activate useful AI capabilities.</p></section>
        <form className="panel auth" onSubmit={signIn}><h2>Start secure setup</h2><label>Email address</label><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /><button disabled={busyAction === "signin"}>{busyAction === "signin" ? "Sending…" : "Email me a sign-in link"}</button>{message && <p className="notice">{message}</p>}</form>
      </main>
    );
  }

  const googleConnected = liveStatus.connection?.status === "connected" || liveStatus.connection?.status === "error";
  const checksPassed = liveStatus.latestTest?.status === "passed";
  const capabilityActive = liveStatus.capability?.status === "active";
  const progress = capabilityActive ? 100 : checksPassed ? 80 : googleConnected ? 60 : workspace?.profile_complete ? 40 : 20;
  const preview = liveStatus.capability?.config?.preview;

  return (
    <main className="dashboard">
      <header><div><span className="eyebrow">THE AI IT DEPARTMENT</span><h1>Business AI setup</h1></div><button className="secondary" onClick={signOut}>Sign out</button></header>
      <section className="progress panel"><div><strong>{progress}%</strong><span>Setup complete</span></div><div className="bar"><i style={{ width: `${progress}%` }} /></div></section>
      <section className="grid">
        <form className="panel" onSubmit={saveWorkspace}><span className="step">STEP 1</span><h2>Name your workspace</h2><p>This becomes the secure tenant boundary for your company.</p><input required minLength={2} value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Your business name" /><button disabled={busyAction === "workspace"}>{busyAction === "workspace" ? "Saving…" : "Save workspace"}</button></form>
        <section className="panel"><span className="step">STEP 2</span><h2>Connect Google Workspace</h2><p>Gmail and Calendar connect through Google&apos;s official permission screen.</p><div className="status"><span className={googleConnected ? "dot connected" : "dot"} />{googleConnected ? liveStatus.connection?.provider_account_label ?? "Connected" : "Not connected"}</div>{googleConnected ? <><button className="secondary" disabled={busyAction === "disconnect"} onClick={disconnectGoogle}>{busyAction === "disconnect" ? "Disconnecting…" : "Disconnect Google"}</button></> : <button disabled={!workspace?.profile_complete || busyAction === "connect"} onClick={connectGoogle}>{busyAction === "connect" ? "Opening Google…" : "Connect Google"}</button>}</section>
        <section className={`panel${googleConnected ? "" : " muted"}`}><span className="step">STEP 3</span><h2>Run connection checks</h2><p>Verify required scopes plus live Gmail and Calendar read access.</p>{checksPassed && <div className="status"><span className="dot connected" />All checks passed</div>}<button disabled={!googleConnected || busyAction === "checks"} onClick={runChecks}>{busyAction === "checks" ? "Running checks…" : checksPassed ? "Run checks again" : "Run checks"}</button></section>
        <section className={`panel${checksPassed ? "" : " muted"}`}><span className="step">STEP 4</span><h2>Activate daily briefing</h2><p>Generate a live preview from unread Gmail messages and today&apos;s Calendar events.</p>{capabilityActive && <div className="status"><span className="dot connected" />Active{preview ? ` · ${preview.unread_messages} unread · ${preview.today_events} events` : ""}</div>}<button disabled={!checksPassed || capabilityActive || busyAction === "activate"} onClick={activateBriefing}>{busyAction === "activate" ? "Activating…" : capabilityActive ? "Daily briefing active" : "Activate capability"}</button></section>
      </section>
      {message && <p className="notice floating">{message}</p>}
    </main>
  );
}
