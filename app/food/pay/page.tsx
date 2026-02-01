"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function PayPage() {
  const sp = useSearchParams();
  const orderId = sp.get("orderId");

  const [msg, setMsg] = useState("Preparing payment...");

  useEffect(() => {
    (async () => {
      if (!orderId) {
        setMsg("Missing orderId");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user?.email;

      if (!email) {
        setMsg("Please login again. Email not found.");
        return;
      }

      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data?.error ?? "Failed to initialize payment");
        return;
      }

      // Redirect to Paystack hosted checkout
      window.location.href = data.authorization_url;
    })();
  }, [orderId]);

  return (
    <main className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold">Paystack Payment</h1>
      <p className="mt-3 text-gray-600">{msg}</p>
    </main>
  );
}
