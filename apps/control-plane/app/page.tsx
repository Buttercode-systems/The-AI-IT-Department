"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabase";

type Workspace = { organization_id: string; organization_name: string; profile_complete: boolean };
type LiveStatus = {
  connection: { status: string; provider_account_label?: string } | null;
  latestTest: { status: string } | null;
  capability: { status: string } | null;
};
type Briefing = { id: string; summary: string; generated_at: string; source_counts: { email?: number; calendar?: number } };
type BriefingItem = {
  id: string;
  item_type: "email" | "calendar" | "action";
  priority: "urgent" | "high" | "normal" | "low";
  title: string;
  summary: string;
  reason: string;
  source_label?: string;
  source_url?: string;
  due_at?: string;
  state: "open" | "done" | "dismissed" | "snoozed";
};
type AuthMode = "signin" | "signup";
type View = "home" | "actions" | "connections";

export default function HomePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [view, setView] = useState<View>("home");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [status, setStatus] = useState<LiveStatus>({ connection: null, latestTest: null, capability: null });
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "google") setMessage("Google connected. Run a secure connection check next.");
    if (params.get("error")) setMessage(`Connection error: ${params.get("error")?.replaceAll("_", " ")}`);
    if (params.size) window.history.replaceState({}, "", window.location.pathname);

    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
      if (session?.user) setShowAuth(false);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => { if (user) void loadWorkspace(); }, [user]);

  async function token() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sign in to continue.");
    return data.session.access_token;
  }

  async function api(path: string, method: "GET" | "POST" = "POST", body?: unknown) {
    const response = await fetch(path, {
      method,
      headers: { authorization: `Bearer ${await token()}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) throw new Error((result as { error?: string }).error?.replaceAll("_", " ") ?? "Request failed");
    return result;
  }

  async function loadWorkspace() {
    const { data, error } = await supabase.rpc("get_or_create_workspace", { requested_name: null });
    if (error) return setMessage(error.message);
    const next = (Array.isArray(data) ? data[0] : data) as Workspace;
    setWorkspace(next);
    setBusinessName(next?.organization_name ?? "");
    try {
      const [live, latest] = await Promise.all([
        api("/api/workspace/status", "GET") as Promise<LiveStatus>,
        api("/api/briefings/latest", "GET") as Promise<{ briefing: Briefing | null; items: BriefingItem[] }>,
      ]);
      setStatus(live);
      setBriefing(latest.briefing);
      setItems(latest.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load workspace.");
    }
  }

  function requireAuth(action?: () => void) {
    if (!user) {
      setShowAuth(true);
      setMessage("Sign in to use this feature.");
      return;
    }
    action?.();
  }

  async function continueWithGoogle() {
    setBusy("google-auth");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } },
    });
    if (error) { setBusy(null); setMessage(error.message); }
  }

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setBusy("auth");
    setMessage("");
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(null);
    if (result.error) setMessage(result.error.message);
    else if (authMode === "signup" && !result.data.session) setMessage("Account created. Confirm your email once, then return here.");
  }

  async function saveWorkspace(event: FormEvent) {
    event.preventDefault();
    setBusy("workspace");
    const { error } = await supabase.rpc("get_or_create_workspace", { requested_name: businessName });
    setBusy(null);
    if (error) setMessage(error.message); else { setMessage("Workspace saved."); await loadWorkspace(); }
  }

  async function connectGoogle() {
    setBusy("connect");
    try {
      const result = await api("/api/connect/google") as { url: string };
      window.location.assign(result.url);
    } catch (error) { setBusy(null); setMessage(error instanceof Error ? error.message : "Could not connect Google."); }
  }

  async function runChecks() {
    setBusy("checks");
    try { await api("/api/connections/google/check"); await loadWorkspace(); setMessage("Gmail and Calendar access verified."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Checks failed."); }
    finally { setBusy(null); }
  }

  async function activate() {
    setBusy("activate");
    try { await api("/api/capabilities/daily-briefing/activate"); await generateBriefing(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Activation failed."); setBusy(null); }
  }

  async function generateBriefing() {
    setBusy("briefing");
    setMessage("Reading recent Gmail and Calendar activity…");
    try {
      const result = await api("/api/briefings/generate") as { briefing: Briefing; items: BriefingItem[] };
      setBriefing(result.briefing);
      setItems(result.items);
      setView("home");
      setMessage("Your briefing is ready.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Briefing failed."); }
    finally { setBusy(null); }
  }

  async function updateItem(id: string, state: BriefingItem["state"]) {
    try {
      const result = await api(`/api/briefing-items/${id}`, "POST", { state }) as { item: BriefingItem };
      setItems((current) => current.map((item) => item.id === id ? result.item : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update item."); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google and remove its stored credentials?")) return;
    setBusy("disconnect");
    try { await api("/api/connections/google/disconnect"); setBriefing(null); setItems([]); await loadWorkspace(); setMessage("Google disconnected."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Disconnect failed."); }
    finally { setBusy(null); }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setWorkspace(null); setBriefing(null); setItems([]); setStatus({ connection: null, latestTest: null, capability: null });
  }

  const connected = status.connection?.status === "connected" || status.connection?.status === "error";
  const checksPassed = status.latestTest?.status === "passed";
  const capabilityActive = status.capability?.status === "active";
  const openItems = items.filter((item) => item.state === "open" || item.state === "snoozed");
  const visibleItems = view === "actions" ? openItems : openItems.slice(0, 8);

  if (!authReady) return <main className="loading">Loading…</main>;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("home")}><span>AI</span><strong>IT Department</strong></button>
        <nav>
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>Today</button>
          <button className={view === "actions" ? "active" : ""} onClick={() => requireAuth(() => setView("actions"))}>Action queue</button>
          <button className={view === "connections" ? "active" : ""} onClick={() => requireAuth(() => setView("connections"))}>Connections</button>
        </nav>
        <div className="sidebar-footer">
          {user ? <><div className="user-chip"><span>{user.email?.slice(0, 1).toUpperCase()}</span><small>{user.email}</small></div><button className="text-button" onClick={signOut}>Sign out</button></> : <button className="compact primary" onClick={() => setShowAuth(true)}>Sign in</button>}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="kicker">THE AI IT DEPARTMENT</p><h1>{view === "connections" ? "Connections" : view === "actions" ? "Action queue" : "Good afternoon"}</h1></div>
          <button className="compact" onClick={() => requireAuth(() => void generateBriefing())} disabled={busy === "briefing"}>{busy === "briefing" ? "Refreshing…" : "Refresh briefing"}</button>
        </header>

        {!user && <section className="welcome-card">
          <div><p className="kicker">YOUR BUSINESS, READY FOR AI</p><h2>Turn Gmail and Calendar into a clear daily action plan.</h2><p>See what needs attention, what is coming up, and where to act next. Explore first; sign in only when you connect an account or generate a briefing.</p></div>
          <button className="compact primary" onClick={() => setShowAuth(true)}>Create your workspace</button>
        </section>}

        {user && view === "connections" && <section className="settings-grid">
          <form className="setting-card" onSubmit={saveWorkspace}><div><h3>Workspace</h3><p>Name the private workspace for your business.</p></div><input value={businessName} minLength={2} required onChange={(e) => setBusinessName(e.target.value)} /><button className="compact" disabled={busy === "workspace"}>Save</button></form>
          <article className="setting-card"><div><h3>Google Workspace</h3><p>{connected ? status.connection?.provider_account_label : "Connect Gmail and Calendar with read-only access."}</p></div>{connected ? <button className="compact danger" onClick={disconnect} disabled={busy === "disconnect"}>Disconnect</button> : <button className="compact primary" onClick={connectGoogle} disabled={!workspace?.profile_complete || busy === "connect"}>Connect Google</button>}</article>
          <article className="setting-card"><div><h3>Connection health</h3><p>{checksPassed ? "Gmail and Calendar checks passed." : "Run a live permission and API test."}</p></div><button className="compact" onClick={runChecks} disabled={!connected || busy === "checks"}>{busy === "checks" ? "Checking…" : "Run checks"}</button></article>
          <article className="setting-card"><div><h3>Daily briefing</h3><p>{capabilityActive ? "Active and ready to generate." : "Activate after connection checks pass."}</p></div><button className="compact primary" onClick={activate} disabled={!checksPassed || busy === "activate"}>{capabilityActive ? "Generate now" : "Activate"}</button></article>
        </section>}

        {user && view !== "connections" && <>
          <section className="briefing-head">
            <div><p className="kicker">TODAY&apos;S BRIEFING</p><h2>{briefing ? briefing.summary : capabilityActive ? "Generate your first briefing" : "Finish connecting your workspace"}</h2>{briefing && <p>Updated {new Date(briefing.generated_at).toLocaleString()}</p>}</div>
            {!briefing && <button className="compact primary" onClick={() => capabilityActive ? void generateBriefing() : setView("connections")}>{capabilityActive ? "Generate briefing" : "Complete setup"}</button>}
          </section>

          {briefing && <div className="stats-row"><div><strong>{openItems.length}</strong><span>Open actions</span></div><div><strong>{briefing.source_counts.email ?? 0}</strong><span>Emails reviewed</span></div><div><strong>{briefing.source_counts.calendar ?? 0}</strong><span>Events reviewed</span></div></div>}

          <section className="feed">
            {visibleItems.map((item) => <article className={`feed-item ${item.priority}`} key={item.id}>
              <div className="feed-icon">{item.item_type === "calendar" ? "C" : "M"}</div>
              <div className="feed-body"><div className="feed-meta"><span>{item.priority}</span><span>{item.source_label}</span>{item.due_at && <span>{new Date(item.due_at).toLocaleString()}</span>}</div><h3>{item.title}</h3><p>{item.summary}</p><small>{item.reason}</small><div className="item-actions">{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">Open source</a>}<button onClick={() => void updateItem(item.id, "done")}>Done</button><button onClick={() => void updateItem(item.id, "snoozed")}>Snooze</button><button onClick={() => void updateItem(item.id, "dismissed")}>Dismiss</button></div></div>
            </article>)}
            {user && briefing && !visibleItems.length && <div className="empty-state"><h3>You&apos;re clear for now.</h3><p>No open items remain in this briefing.</p></div>}
          </section>
        </>}
      </section>

      {showAuth && !user && <div className="modal-backdrop" onMouseDown={() => setShowAuth(false)}><section className="auth-modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setShowAuth(false)}>×</button><h2>{authMode === "signup" ? "Create your workspace" : "Welcome back"}</h2><p>Your session stays active on this device.</p><button className="google-button" onClick={continueWithGoogle} disabled={busy === "google-auth"}>Continue with Google</button><div className="divider"><span>or</span></div><form onSubmit={authenticate}><input type="email" required placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} /><input type="password" required minLength={8} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} /><button className="primary" disabled={busy === "auth"}>{busy === "auth" ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}</button></form><button className="text-button" onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}>{authMode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button>{message && <p className="auth-message">{message}</p>}</section></div>}
      {message && user && <div className="toast">{message}<button onClick={() => setMessage("")}>×</button></div>}
    </main>
  );
}
