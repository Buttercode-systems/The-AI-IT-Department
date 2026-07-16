"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase";

export default function ManageLauncher() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (!signedIn) return null;
  return <a className="manage-launcher" href="/manage">Manage</a>;
}
