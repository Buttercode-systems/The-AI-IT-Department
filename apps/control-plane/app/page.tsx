"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabase";

type Workspace = { organization_id: string; organization_name: string; profile_complete: boolean };
type Conversation = { id: string; title: string; created_at: string; updated_at: string };
type ChatMessage = { id: string; role: "user" | "assistant" | "tool" | "system"; content: string; created_at: string };
type LiveStatus = {
  connection: { status: string; provider_account_label?: string; granted_scopes?: string[] } | null;
  latestTest: { status: string; scopes_ok?: boolean; details?: { drive_ok?: boolean; missing_scopes?: string[] } } | null;
  capability: { status: string } | null;
};
type Profile = { business_type?: string; user_role?: string; timezone?: string; communication_style?: string; operating_context?: Record<string, string | null>; onboarding_completed_at?: string | null };
type View = "chat" | "settings";
type AuthMode = "signin" | "signup";

const REQUIRED_EXECUTION_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
];

const starters = [
  "Find customer emails I have not replied to",
  "Check Saturday availability and prepare an appointment reply",
  "Find my latest price list in Drive",
  "Draft a reply to the most urgent customer email",
];

export default function HomePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [view, setView] = useState<View>("chat");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [status, setStatus] = useState<LiveStatus>({ connection: null, latestTest: null, capability: null });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [userRole, setUserRole] = useState("");
  const [timezone, setTimezone] = useState("Africa/Johannesburg");
  const [communicationStyle, setCommunicationStyle] = useState("clear and professional");
  const [typicalCustomers, setTypicalCustomers] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [importantRules, setImportantRules] = useState("");
  const [notice, setNotice] = useState("");
  const [runStatus, setRunStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "google") setNotice("Google Workspace connected. Run checks to verify Gmail, Calendar and Drive access.");
    if (params.get("error")) setNotice(`Connection error: ${params.get("error")?.replaceAll("_", " ")}`);
    if (params.size) window.history.replaceState({}, "", window.location.pathname);
    void supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null); setAuthReady(true); if (session?.user) setShowAuth(false);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => { if (user) void bootstrap(); else resetPrivateState(); }, [user]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, runStatus]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const close = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setMobileNavOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileNavOpen]);

  function resetPrivateState() {
    setWorkspace(null); setConversations([]); setActiveConversationId(null); setMessages([]); setProfile(null); setMobileNavOpen(false);
    setStatus({ connection: null, latestTest: null, capability: null });
  }

  function returnToChatHome() {
    setActiveConversationId(null);
    setMessages([]);
    setRunStatus("");
    setView("chat");
    setMobileNavOpen(false);
  }

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sign in to continue.");
    return data.session.access_token;
  }

  async function api<T>(path: string, method: "GET" | "POST" = "POST", body?: unknown): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${await accessToken()}` };
    const init: RequestInit = { method, headers };
    if (body !== undefined) { headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
    const response = await fetch(path, init);
    const result = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(result.error?.replaceAll("_", " ") || "Request failed");
    return result;
  }

  async function bootstrap() {
    const { data, error } = await supabase.rpc("get_or_create_workspace", { requested_name: null });
    if (error) return setNotice(error.message);
    const next = (Array.isArray(data) ? data[0] : data) as Workspace;
    setWorkspace(next); setBusinessName(next.organization_name);
    try {
      const [live, onboarding, threads] = await Promise.all([
        api<LiveStatus>("/api/workspace/status", "GET"),
        api<{ profile: Profile }>("/api/onboarding", "GET"),
        api<{ conversations: Conversation[] }>("/api/conversations", "GET"),
      ]);
      setStatus(live); setProfile(onboarding.profile); hydrateProfile(onboarding.profile); setConversations(threads.conversations);
      returnToChatHome();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load your workspace."); }
  }

  function hydrateProfile(next: Profile) {
    setBusinessType(next.business_type ?? ""); setUserRole(next.user_role ?? ""); setTimezone(next.timezone ?? "Africa/Johannesburg");
    setCommunicationStyle(next.communication_style ?? "clear and professional");
    setTypicalCustomers(next.operating_context?.typical_customers ?? ""); setWorkingHours(next.operating_context?.working_hours ?? ""); setImportantRules(next.operating_context?.important_rules ?? "");
  }

  async function openConversation(id: string) {
    setBusy("thread"); setActiveConversationId(id); setView("chat"); setMobileNavOpen(false);
    try {
      const result = await api<{ messages: ChatMessage[] }>(`/api/conversations/${id}/messages`, "GET");
      setMessages(result.messages.filter((item) => item.role !== "tool"));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open conversation."); }
    finally { setBusy(null); }
  }

  async function newConversation() {
    if (!user) return setShowAuth(true);
    setMobileNavOpen(false);
    const result = await api<{ conversation: Conversation }>("/api/conversations", "POST", {});
    setConversations((current) => [result.conversation, ...current]);
    setActiveConversationId(result.conversation.id); setMessages([]); setView("chat");
  }

  async function sendMessage(text = draft) {
    const clean = text.trim();
    if (!clean) return;
    if (!user) { setDraft(clean); setShowAuth(true); return; }
    setBusy("chat"); setRunStatus("Understanding your request…"); setDraft("");
    try {
      let conversationId = activeConversationId;
      if (!conversationId) {
        const created = await api<{ conversation: Conversation }>("/api/conversations", "POST", {});
        conversationId = created.conversation.id; setActiveConversationId(conversationId); setConversations((current) => [created.conversation, ...current]);
      }
      const response = await fetch(`/api/conversations/${conversationId}/chat`, {
        method: "POST",
        headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
        body: JSON.stringify({ message: clean }),
      });
      if (!response.ok || !response.body) throw new Error("AID could not start this request.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const payload = JSON.parse(line) as { type: string; data: Record<string, unknown> };
          if (payload.type === "user_message") setMessages((current) => [...current, payload.data as unknown as ChatMessage]);
          if (payload.type === "status") setRunStatus(String(payload.data.message ?? "Working…"));
          if (payload.type === "tool_start") setRunStatus(`Using ${String(payload.data.name ?? "tool").replaceAll("_", " ")}…`);
          if (payload.type === "approval") setNotice("AID prepared an action. Review the approval card before it executes.");
          if (payload.type === "assistant_message") setMessages((current) => [...current, payload.data as unknown as ChatMessage]);
          if (payload.type === "error") throw new Error(String(payload.data.message ?? "AID request failed").replaceAll("_", " "));
        }
      }
      const threads = await api<{ conversations: Conversation[] }>("/api/conversations", "GET"); setConversations(threads.conversations);
    } catch (error) { setNotice(error instanceof Error ? error.message : "AID request failed."); setDraft(clean); }
    finally { setBusy(null); setRunStatus(""); }
  }

  function composerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  }

  async function continueWithGoogle() {
    setBusy("google-auth");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } } });
    if (error) { setBusy(null); setNotice(error.message); }
  }

  async function authenticate(event: FormEvent) {
    event.preventDefault(); setBusy("auth"); setNotice("");
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(null);
    if (result.error) setNotice(result.error.message);
    else if (authMode === "signup" && !result.data.session) setNotice("Account created. Confirm your email once, then return here.");
  }

  async function saveWorkspace(event: FormEvent) {
    event.preventDefault(); setBusy("workspace");
    const { error } = await supabase.rpc("get_or_create_workspace", { requested_name: businessName });
    setBusy(null); if (error) setNotice(error.message); else { setNotice("Workspace saved."); await bootstrap(); }
  }

  async function saveOnboarding(event: FormEvent) {
    event.preventDefault(); setBusy("onboarding");
    try {
      const result = await api<{ profile: Profile }>("/api/onboarding", "POST", { business_type: businessType, user_role: userRole, timezone, communication_style: communicationStyle, typical_customers: typicalCustomers, working_hours: workingHours, important_rules: importantRules });
      setProfile(result.profile); setNotice("Business context saved. AID will use it in future conversations.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save onboarding."); }
    finally { setBusy(null); }
  }

  async function connectGoogle() {
    setBusy("connect");
    try { const result = await api<{ url: string }>("/api/connect/google"); window.location.assign(result.url); }
    catch (error) { setBusy(null); setNotice(error instanceof Error ? error.message : "Could not connect Google."); }
  }

  async function runChecks() {
    setBusy("checks");
    try {
      const result = await api<{ passed: boolean; reconnect_required: boolean }>("/api/connections/google/check");
      setNotice(result.passed ? "Gmail, Calendar and Drive execution access verified." : result.reconnect_required ? "Reconnect Google to grant AID the new execution permissions." : "Google checks failed.");
      await bootstrap();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Checks failed."); }
    finally { setBusy(null); }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google and remove its stored credentials?")) return;
    setBusy("disconnect");
    try { await api("/api/connections/google/disconnect"); setNotice("Google disconnected."); await bootstrap(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Disconnect failed."); }
    finally { setBusy(null); }
  }

  async function signOut() { setMobileNavOpen(false); await supabase.auth.signOut(); setView("chat"); }

  const connected = status.connection?.status === "connected" || status.connection?.status === "error";
  const scopes = status.connection?.granted_scopes ?? [];
  const executionReady = REQUIRED_EXECUTION_SCOPES.every((scope) => scopes.includes(scope)) && status.latestTest?.status === "passed";
  const activeConversation = conversations.find((item) => item.id === activeConversationId);
  const assistantWelcome = connected
    ? executionReady
      ? `Welcome${workspace?.organization_name ? ` to ${workspace.organization_name}` : ""}. Gmail, Calendar and Drive are ready. I can find information, create drafts, and prepare actions for your approval.`
      : "Your Google account is connected, but AID needs the new execution permissions. Open Settings and reconnect Google."
    : "Connect Google Workspace when you are ready. AID can then work across Gmail, Calendar and Drive through conversation.";

  if (!authReady) return <main className="loading"><span className="loading-mark">AID</span><span>Preparing your workspace…</span></main>;

  return (
    <main className="chat-app">
      <aside className="chat-sidebar">
        <div className="sidebar-top"><button className="wordmark" onClick={returnToChatHome}><span>AID</span><strong>AI IT Department</strong></button><button className="icon-button" aria-label="New conversation" title="New conversation" onClick={() => void newConversation()}>＋</button></div>
        <button className="new-chat" onClick={() => void newConversation()}>＋ New conversation</button>
        <div className="thread-list">
          {user && conversations.map((item) => <button key={item.id} className={item.id === activeConversationId && view === "chat" ? "active" : ""} onClick={() => void openConversation(item.id)}><span>{item.title}</span></button>)}
          {!user && <p className="sidebar-hint">Your conversations will appear here after you sign in.</p>}
        </div>
        <div className="sidebar-bottom">
          {user ? <><button className={view === "settings" ? "active settings-link" : "settings-link"} onClick={() => setView("settings")}>Settings & connections</button><div className="account-row"><span>{user.email?.slice(0, 1).toUpperCase()}</span><small>{user.email}</small></div><button className="plain-link" onClick={() => void signOut()}>Sign out</button></> : <button className="sign-in-link" onClick={() => setShowAuth(true)}>Sign in</button>}
        </div>
      </aside>

      <section className="chat-main">
        {view === "chat" ? <>
          <header className="chat-header mobile-release-header">
            <div className="mobile-header-leading">
              {activeConversationId && <button className="mobile-back" aria-label="Back to new chat" onClick={returnToChatHome}>‹</button>}
              <button className="mobile-history" aria-label="Open conversations" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}>☰</button>
              <div className="header-copy"><strong>{activeConversation?.title || "AID"}</strong><small>{executionReady ? `Ready with ${status.connection?.provider_account_label}` : connected ? "Google reconnection required" : "AI IT Department"}</small></div>
            </div>
            <button className="mobile-settings" onClick={() => user ? setView("settings") : setShowAuth(true)}>Settings</button>
          </header>
          <div className="message-scroll">
            {!messages.length && <section className="empty-chat"><div className="assistant-mark">AID</div><h1>{user ? "What should AID handle?" : "Your AI IT Department"}</h1><p>{assistantWelcome}</p><div className="starter-grid">{starters.map((starter) => <button key={starter} onClick={() => void sendMessage(starter)}>{starter}<span>→</span></button>)}</div></section>}
            <div className="messages">{messages.map((item) => <article className={`message ${item.role}`} key={item.id}><div className="avatar">{item.role === "assistant" ? "AID" : user?.email?.slice(0, 1).toUpperCase()}</div><div className="message-content"><strong>{item.role === "assistant" ? "AID" : "You"}</strong><p>{item.content}</p></div></article>)}</div>
            {runStatus && <div className="thinking" role="status" aria-live="polite"><span></span>{runStatus}</div>}
            <div ref={bottomRef} />
          </div>
          <div className="composer-wrap"><div className="composer"><textarea aria-label="Message AID" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={composerKeyDown} placeholder="Message AID" rows={1} /><button aria-label="Send message" onClick={() => void sendMessage()} disabled={!draft.trim() || busy === "chat"}>↑</button></div><small>AID reads connected data directly. External and destructive actions require your approval.</small></div>
        </> : <>
          <header className="chat-header"><div className="mobile-header-leading"><button className="mobile-back" aria-label="Back to chat" onClick={() => setView("chat")}>‹</button><div><strong>Settings & connections</strong><small>Manage the context and accounts AID can use.</small></div></div><button className="mobile-settings" onClick={() => setView("chat")}>Done</button></header>
          <div className="settings-scroll">
            <section className="settings-section"><h2>Business workspace</h2><form className="settings-card" onSubmit={saveWorkspace}><label>Workspace name<input value={businessName} minLength={2} required onChange={(e) => setBusinessName(e.target.value)} /></label><button disabled={busy === "workspace"}>Save</button></form></section>
            <section className="settings-section"><h2>AID context</h2><form className="onboarding-card" onSubmit={saveOnboarding}><label>Business type<input required value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="Salon, consultancy, contractor…" /></label><label>Your role<input required value={userRole} onChange={(e) => setUserRole(e.target.value)} placeholder="Owner, manager, assistant…" /></label><label>Timezone<input required value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label><label>Communication style<input value={communicationStyle} onChange={(e) => setCommunicationStyle(e.target.value)} /></label><label>Typical customers<input value={typicalCustomers} onChange={(e) => setTypicalCustomers(e.target.value)} /></label><label>Working hours<input value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} placeholder="Mon–Sat, 08:00–18:00" /></label><label className="wide">Important operating rules<textarea value={importantRules} onChange={(e) => setImportantRules(e.target.value)} rows={3} /></label><button disabled={busy === "onboarding"}>{profile?.onboarding_completed_at ? "Update context" : "Complete onboarding"}</button></form></section>
            <section className="settings-section"><h2>Google Workspace</h2><div className="connection-card"><div><span className={executionReady ? "status-dot live" : "status-dot"}></span><strong>{connected ? status.connection?.provider_account_label : "Not connected"}</strong><p>{executionReady ? "Gmail, Calendar and Drive are verified for AID. Sends, event changes and sharing require approval." : connected ? "Reconnect Google to grant Gmail, Calendar and Drive execution permissions." : "Connect Gmail, Calendar and Drive."}</p></div><div className="connection-actions">{connected ? <><button className={!executionReady ? "primary-small" : ""} onClick={() => void connectGoogle()} disabled={busy === "connect"}>{executionReady ? "Reconnect" : "Grant permissions"}</button><button onClick={() => void runChecks()} disabled={busy === "checks"}>Run checks</button><button className="danger" onClick={() => void disconnect()} disabled={busy === "disconnect"}>Disconnect</button></> : <button className="primary-small" onClick={() => void connectGoogle()} disabled={!workspace?.profile_complete || busy === "connect"}>Connect Google</button>}</div></div></section>
          </div>
        </>}
      </section>

      {mobileNavOpen && <div className="mobile-nav-backdrop" onMouseDown={() => setMobileNavOpen(false)}><aside className="mobile-nav-sheet" role="dialog" aria-modal="true" aria-label="Conversations" onMouseDown={(event) => event.stopPropagation()}><div className="mobile-sheet-handle" /><header><div><span>Workspace</span><strong>Conversations</strong></div><button aria-label="Close conversations" onClick={() => setMobileNavOpen(false)}>×</button></header><button className="mobile-sheet-new" onClick={() => void newConversation()}><span>＋</span><div><strong>New conversation</strong><small>Start with a clean context</small></div></button><div className="mobile-thread-list">{conversations.length ? conversations.map((item) => <button key={item.id} className={item.id === activeConversationId ? "active" : ""} onClick={() => void openConversation(item.id)}><span>{item.title}</span><small>{new Date(item.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></button>) : <div className="mobile-empty-history"><strong>No conversations yet</strong><p>Your completed conversations will appear here.</p></div>}</div><footer>{user ? <><button onClick={() => { setMobileNavOpen(false); setView("settings"); }}>Settings & connections</button><button onClick={() => void signOut()}>Sign out</button></> : <button onClick={() => { setMobileNavOpen(false); setShowAuth(true); }}>Sign in</button>}</footer></aside></div>}

      {showAuth && !user && <div className="modal-backdrop" onMouseDown={() => setShowAuth(false)}><section className="auth-modal" onMouseDown={(e) => e.stopPropagation()}><button className="modal-close" aria-label="Close" onClick={() => setShowAuth(false)}>×</button><h2>{authMode === "signup" ? "Create your AID workspace" : "Welcome back"}</h2><p>Sign in only when you are ready to use connected capabilities. Your session stays active on this device.</p><button className="google-button" onClick={() => void continueWithGoogle()} disabled={busy === "google-auth"}>Continue with Google</button><div className="divider"><span>or</span></div><form onSubmit={authenticate}><input type="email" required autoComplete="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} /><input type="password" required minLength={8} autoComplete={authMode === "signup" ? "new-password" : "current-password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} /><button className="auth-primary" disabled={busy === "auth"}>{busy === "auth" ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"}</button></form><button className="switch-auth" onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}>{authMode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button>{notice && <p className="auth-notice">{notice}</p>}</section></div>}
      {notice && user && <div className="toast" role="status" aria-live="polite">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
    </main>
  );
}
