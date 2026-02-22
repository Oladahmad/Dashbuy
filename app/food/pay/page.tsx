"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function PayPageInner() {
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
      <h1 className="text-xl font-bold sm:text-2xl">Paystack Payment</h1>
      <p className="mt-3 text-gray-600">{msg}</p>
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<main className="p-6 max-w-xl"><p className="mt-3 text-gray-600">Preparing payment...</p></main>}>
      <PayPageInner />
    </Suspense>
  );
}
