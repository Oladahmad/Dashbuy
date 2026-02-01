"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SupabaseTestPage() {
  const [msg, setMsg] = useState("Testing...");

  useEffect(() => {
    (async () => {
      const { error } = await supabase.auth.getSession();
      setMsg(error ? `Error: ${error.message}` : "Connected ✅");
    })();
  }, []);

  return <main className="p-6 text-xl">{msg}</main>;
}
