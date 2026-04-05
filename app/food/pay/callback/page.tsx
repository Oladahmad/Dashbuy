"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function PayCallbackPageInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [msg, setMsg] = useState("Verifying payment...");
  const startedRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (startedRef.current) return;
      startedRef.current = true;

      const reference = sp.get("transaction_ref") || sp.get("reference");

      if (!reference) {
        setMsg("Missing payment reference. Payment cannot be verified.");
        return;
      }

      try {
        const resp = await fetch("/api/paystack/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference }),
        });

        const json = await resp.json();
        if (!resp.ok || !json?.ok) {
          setMsg(json?.error ?? "Verification failed");
          return;
        }

        const orderIds = Array.isArray(json?.orders)
          ? json.orders.map((row: { id?: string }) => String(row?.id ?? "").trim()).filter(Boolean)
          : [];
        const successQuery =
          orderIds.length > 1
            ? `orderIds=${encodeURIComponent(orderIds.join(","))}`
            : orderIds.length === 1
              ? `orderId=${encodeURIComponent(orderIds[0])}`
              : "";

        setMsg("Payment verified. Redirecting...");
        router.replace(successQuery ? `/food/order-success?${successQuery}` : "/orders");
      } catch (e: unknown) {
        const m = e instanceof Error ? e.message : "Network error";
        setMsg(m);
      }
    })();
  }, [router, sp]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6">
        <p className="text-sm text-gray-600">Dashbuy payment</p>
        <p className="mt-1 text-lg">{msg}</p>
      </div>
    </main>
  );
}

export default function PayCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-white p-6">
          <div className="w-full max-w-md rounded-2xl border bg-white p-6">
            <p className="text-sm text-gray-600">Dashbuy payment</p>
            <p className="mt-1 text-lg">Verifying payment...</p>
          </div>
        </main>
      }
    >
      <PayCallbackPageInner />
    </Suspense>
  );
}
