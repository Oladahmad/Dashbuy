"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

type OrderSummaryRow = {
  id: string;
  total: number | null;
  status: string | null;
  created_at: string;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function SuccessInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [orders, setOrders] = useState<OrderSummaryRow[]>([]);

  const orderIds = useMemo(() => {
    const one = sp.get("orderId");
    const many = sp.get("orderIds");
    const ids = [
      ...(one ? [one] : []),
      ...(many ? many.split(",") : []),
    ]
      .map((id) => id.trim())
      .filter(Boolean);
    return Array.from(new Set(ids));
  }, [sp]);

  useEffect(() => {
    (async () => {
      if (orderIds.length === 0) {
        setMsg("Order details are not available yet.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select("id,total,status,created_at")
        .in("id", orderIds)
        .order("created_at", { ascending: false });

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      setOrders((data as OrderSummaryRow[] | null) ?? []);
      setLoading(false);
    })();
  }, [orderIds]);

  const total = orders.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
  const primaryId = orders[0]?.id ?? orderIds[0] ?? "";

  return (
    <AppShell title="Order success">
      <div className="rounded-3xl border bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Food order</p>
        <h1 className="mt-2 text-2xl font-bold">Payment successful</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your order has been sent successfully and the vendor can now begin processing it.
        </p>

        {loading ? (
          <div className="mt-5 rounded-2xl border bg-gray-50 p-4 text-sm text-gray-600">Loading order details...</div>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border p-4">
                <p className="text-xs text-gray-500">Order ID</p>
                <p className="mt-1 font-semibold break-all">{primaryId || "Not available"}</p>
              </div>
              <div className="rounded-2xl border p-4">
                <p className="text-xs text-gray-500">Orders</p>
                <p className="mt-1 font-semibold">{orders.length || orderIds.length}</p>
              </div>
              <div className="rounded-2xl border p-4">
                <p className="text-xs text-gray-500">Total paid</p>
                <p className="mt-1 font-semibold">{naira(total)}</p>
              </div>
            </div>

            {orders.length > 0 ? (
              <div className="rounded-2xl border p-4">
                <p className="text-sm font-semibold">Order details</p>
                <div className="mt-3 grid gap-3">
                  {orders.map((row) => (
                    <div key={row.id} className="rounded-2xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Order ID</p>
                      <p className="mt-1 text-sm font-semibold break-all">{row.id}</p>
                      <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
                        <span>Status: {row.status ?? "unknown"}</span>
                        <span>{naira(Number(row.total ?? 0))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {msg ? <p className="text-sm text-red-600">{msg}</p> : null}
          </div>
        )}

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="rounded-2xl bg-black px-4 py-3 text-sm text-white"
            onClick={() => router.push(primaryId ? `/orders/${primaryId}` : "/orders")}
          >
            View order details
          </button>
          <button
            type="button"
            className="rounded-2xl border px-4 py-3 text-sm"
            onClick={() => router.push("/food")}
          >
            Back to food
          </button>
        </div>
      </div>
    </AppShell>
  );
}

export default function FoodOrderSuccess() {
  return (
    <Suspense fallback={<AppShell title="Order success"><div className="rounded-3xl border bg-white p-6 text-sm text-gray-600">Loading order details...</div></AppShell>}>
      <SuccessInner />
    </Suspense>
  );
}
