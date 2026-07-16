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

export default function HomePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!user) return;
    void loadWorkspace();
  }, [user]);

  async function loadWorkspace() {
    const { data, error } = await supabase.rpc("get_or_create_workspace", {
      requested_name: businessName || null,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setWorkspace(Array.isArray(data) ? data[0] : data);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    setMessage(error ? error.message : "Check your email for the secure sign-in link.");
  }

  async function saveWorkspace(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.rpc("get_or_create_workspace", {
      requested_name: businessName,
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else setWorkspace(Array.isArray(data) ? data[0] : data);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setWorkspace(null);
  }

  if (!user) {
    return (
      <main className="shell">
        <section className="hero">
          <span className="eyebrow">THE AI IT DEPARTMENT</span>
          <h1>Your business tools, connected to AI without the setup headache.</h1>
          <p>Sign in to create your private workspace, connect your own accounts, verify permissions and activate useful AI capabilities.</p>
        </section>
        <form className="panel auth" onSubmit={signIn}>
          <h2>Start secure setup</h2>
          <label>Email address</label>
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
          <button disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
          {message && <p className="notice">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="dashboard">
      <header>
        <div><span className="eyebrow">THE AI IT DEPARTMENT</span><h1>Business AI setup</h1></div>
        <button className="secondary" onClick={signOut}>Sign out</button>
      </header>

      <section className="progress panel">
        <div><strong>{workspace?.profile_complete ? "40" : "20"}%</strong><span>Setup complete</span></div>
        <div className="bar"><i style={{ width: workspace?.profile_complete ? "40%" : "20%" }} /></div>
      </section>

      <section className="grid">
        <form className="panel" onSubmit={saveWorkspace}>
          <span className="step">STEP 1</span>
          <h2>Name your workspace</h2>
          <p>This becomes the secure tenant boundary for your company.</p>
          <input required minLength={2} value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder={workspace?.organization_name || "Your business name"} />
          <button disabled={busy}>{busy ? "Saving…" : "Save workspace"}</button>
        </form>

        <section className="panel">
          <span className="step">STEP 2</span>
          <h2>Connect Google Workspace</h2>
          <p>Gmail and Calendar will be connected through your own Google account. No credentials are shared with us.</p>
          <div className="status"><span className={workspace?.google_status === "connected" ? "dot connected" : "dot"} />{workspace?.google_status || "Not connected"}</div>
          <button disabled={!workspace?.profile_complete}>Connect Google</button>
        </section>

        <section className="panel muted">
          <span className="step">STEP 3</span>
          <h2>Run connection checks</h2>
          <p>We will verify identity, granted scopes and safe read access before activating any capability.</p>
          <button disabled>Available after connection</button>
        </section>

        <section className="panel muted">
          <span className="step">STEP 4</span>
          <h2>Activate daily briefing</h2>
          <p>Receive a source-backed summary of important Gmail messages and today’s Calendar events.</p>
          <button disabled>Activate capability</button>
        </section>
      </section>
      {message && <p className="notice floating">{message}</p>}
    </main>
  );
}