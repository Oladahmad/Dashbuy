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

  const [msg, setMsg] = useState("Preparing payment gateway...");
  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const startedRef = useRef(false);

  async function startCheckout() {
    if (loading) return;

    if (!orderId && orderIds.length === 0) {
      setMsg("Missing order reference.");
      return;
    }

    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const email = session?.user?.email?.trim() ?? "";

    if (!session?.access_token) {
      setMsg("Session expired. Redirecting to login...");
      window.location.href = "/auth/login?next=%2Ffood%2Fpay";
      return;
    }

    if (!email) {
      setMsg("Missing customer email on your account. Please log in again.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          orderId: orderId ?? undefined,
          orderIds: orderIds.length > 0 ? orderIds : undefined,
          email,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok || !data?.authorization_url) {
        setMsg(data?.error ?? "Unable to start payment.");
        setLoading(false);
        return;
      }

      setCheckoutUrl(String(data.authorization_url));
      setMsg("Redirecting to payment gateway...");
      window.location.href = String(data.authorization_url);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Network error";
      setMsg(m);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startCheckout();
  }, [orderId, orderIds]);

  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Dashbuy checkout</p>
        <h1 className="mt-2 text-xl font-bold sm:text-2xl">Redirecting to payment gateway</h1>
        <p className="mt-3 text-sm text-gray-600">{msg}</p>

        {checkoutUrl ? (
          <a
            href={checkoutUrl}
            className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-black px-4 py-3 text-sm font-medium text-white"
          >
            Continue
          </a>
        ) : (
          <button
            type="button"
            className="mt-5 w-full rounded-2xl border px-4 py-3 text-sm font-medium"
            onClick={() => void startCheckout()}
            disabled={loading}
          >
            {loading ? "Preparing..." : "Retry"}
          </button>
        )}
      </div>
    </main>
  );
}

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-xl p-6">
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Dashbuy checkout</p>
            <p className="mt-3 text-sm text-gray-600">Preparing payment gateway...</p>
          </div>
        </main>
      }
    >
      <PayPageInner />
    </Suspense>
  );
}
