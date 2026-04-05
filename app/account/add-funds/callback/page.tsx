"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

export default function AddFundsCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Verifying payment...");

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("transaction_ref") || params.get("reference") || params.get("trxref") || "";
      if (!ref) {
        setMsg("Missing payment reference.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";

      const res = await fetch("/api/wallet/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ reference: ref }),
      });

      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setMsg(body?.error ?? "Payment verification failed.");
        return;
      }

      setMsg("Wallet funded successfully. Redirecting...");
      setTimeout(() => router.replace("/account"), 1000);
    })();
  }, [router]);

  return (
    <AppShell title="Add funds">
      <div className="rounded-2xl border bg-white p-6 text-sm text-gray-700">{msg}</div>
    </AppShell>
  );
}
