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
  const [dva, setDva] = useState<{
    account_number: string;
    account_name: string;
    bank_name: string;
    amount: number;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (startedRef.current) return;
      startedRef.current = true;

      if (!orderId && orderIds.length === 0) {
        setMsg("Missing orderId");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      if (!token) {
        setMsg("Session expired. Redirecting to login...");
        window.location.href = "/auth/login?next=%2Ffood%2Fpay";
        return;
      }

      setCreating(true);
      const res = await fetch("/api/paystack/dva/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId: orderId ?? undefined,
          orderIds: orderIds.length > 0 ? orderIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setMsg(data?.error ?? "Failed to initialize transfer account");
        setCreating(false);
        return;
      }
      setDva({
        account_number: data.account_number,
        account_name: data.account_name,
        bank_name: data.bank_name,
        amount: Number(data.amount || 0),
      });
      setMsg("Transfer to the account below to complete payment.");
      setCreating(false);
    })();
  }, [orderId, orderIds, orderIdsParam]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (!dva) return;
    timer = setInterval(async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      if (!token) return;
      const ids = orderId ? [orderId] : orderIds;
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("orders")
        .select("id,status")
        .in("id", ids);
      const paid = (data ?? []).every((row) => String((row as { status?: string }).status ?? "") === "pending_vendor");
      if (paid) {
        if (timer) clearInterval(timer);
        window.location.href = "/food/order-success";
      }
    }, 6000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [dva, orderId, orderIds]);

  async function checkPaymentStatus() {
    if (!dva || checking) return;
    setChecking(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    if (!token) {
      setMsg("Session expired. Redirecting to login...");
      window.location.href = "/auth/login?next=%2Ffood%2Fpay";
      return;
    }
    const ids = orderId ? [orderId] : orderIds;
    if (ids.length === 0) {
      setChecking(false);
      return;
    }
    const { data } = await supabase
      .from("orders")
      .select("id,status")
      .in("id", ids);
    const paid = (data ?? []).every((row) => String((row as { status?: string }).status ?? "") === "pending_vendor");
    if (paid) {
      window.location.href = "/food/order-success";
      return;
    }
    setMsg("We’re still waiting for confirmation. It can take a few minutes after transfer.");
    setChecking(false);
  }

  async function payWithCard() {
    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData.session?.user?.email;
    if (!email) {
      setMsg("Please login again. Email not found.");
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
      return;
    }
    window.location.href = data.authorization_url;
  }

  return (
    <main className="p-6 max-w-xl">
      <h1 className="text-xl font-bold sm:text-2xl">Pay for your order</h1>
      <p className="mt-3 text-gray-600">{msg}</p>

      {dva ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 space-y-3">
          <div>
            <p className="text-xs text-gray-600">Bank</p>
            <p className="text-base font-semibold">{dva.bank_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Account number</p>
            <p className="text-base font-semibold">{dva.account_number}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Account name</p>
            <p className="text-base font-semibold">{dva.account_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Amount to pay</p>
            <p className="text-lg font-bold">N{Math.round(dva.amount).toLocaleString()}</p>
          </div>
          <p className="text-xs text-gray-500">
            Transfer to this account and your order will update automatically once payment is confirmed.
          </p>
          <p className="text-xs text-gray-500">
            Please send the exact amount. Wrong amounts may delay confirmation.
          </p>
          <button
            type="button"
            className="w-full rounded-xl border px-4 py-3 text-sm"
            onClick={checkPaymentStatus}
            disabled={checking}
          >
            {checking ? "Checking payment..." : "I’ve sent the money"}
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          className="w-full rounded-xl border px-4 py-3 text-sm"
          onClick={payWithCard}
          disabled={creating}
        >
          Pay with card instead
        </button>
      </div>
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
