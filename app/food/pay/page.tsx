"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function PayPageInner() {
  const sp = useSearchParams();
  const orderId = sp.get("orderId");
  const orderIdsParam = sp.get("orderIds") ?? "";
  const orderIds = useMemo(
    () =>
      orderIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    [orderIdsParam]
  );

  const [msg, setMsg] = useState("Preparing payment...");
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);

  async function initCardPayment() {
    if (loading) return;
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData.session?.user?.email;
    if (!email) {
      setMsg("Please login again. Email not found.");
      setLoading(false);
      return;
    }
    const res = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: orderId ?? undefined,
        orderIds: orderIds.length > 0 ? orderIds : undefined,
        email,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data?.authorization_url) {
      setMsg(data?.error ?? "Failed to initialize card payment");
      setLoading(false);
      return;
    }
    window.location.href = data.authorization_url;
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!orderId && orderIds.length === 0) {
      setMsg("Missing orderId");
      return;
    }
    initCardPayment();
  }, [orderId, orderIdsParam]);

  return (
    <main className="p-6 max-w-xl">
      <h1 className="text-xl font-bold sm:text-2xl">Pay for your order</h1>
      <p className="mt-3 text-gray-600">{msg}</p>
      <button
        type="button"
        className="mt-4 w-full rounded-xl border px-4 py-3 text-sm"
        onClick={initCardPayment}
        disabled={loading}
      >
        {loading ? "Redirecting..." : "Retry payment"}
      </button>
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <main className="p-6 max-w-xl">
          <p className="mt-3 text-gray-600">Preparing payment...</p>
        </main>
      }
    >
      <PayPageInner />
    </Suspense>
  );
}
