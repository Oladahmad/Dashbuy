"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type OrderRow = {
  id: string;
  order_type: "food" | "product";
  food_mode: "plate" | "combo" | null;
  status: string | null;
  total: number | null;
  created_at: string;
};

function naira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function labelForOrder(o: OrderRow) {
  if (o.order_type === "product") return "Product Order";
  if ((o.food_mode ?? "plate") === "combo") return "Food Combo Order";
  return "Food Plate Order";
}

function typeForOrder(o: OrderRow) {
  if (o.order_type === "product") return "Type: Products";
  if ((o.food_mode ?? "plate") === "combo") return "Type: Food - Combo";
  return "Type: Food - Plate";
}

function friendlyStatus(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "pending_payment") return "Awaiting payment";
  if (s === "pending_vendor") return "Paid - waiting vendor";
  if (s === "accepted") return "Accepted";
  if (s === "rejected" || s === "declined") return "Declined";
  if (s === "picked_up") return "On delivery";
  if (s === "pending_pickup") return "Rider pending pickup";
  if (s === "delivered") return "Delivered";
  if (s === "cancelled") return "Cancelled";
  if (s === "refunded") return "Refunded";
  return status ?? "Unknown";
}

export default function OrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const counts = useMemo(() => {
    let food = 0;
    let products = 0;
    for (const o of orders) {
      if (o.order_type === "food") food += 1;
      if (o.order_type === "product") products += 1;
    }
    return { food, products, total: orders.length };
  }, [orders]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");
      setOrders([]);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select("id,order_type,food_mode,status,total,created_at")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        setMsg(error.message);
        setOrders([]);
        setLoading(false);
        return;
      }

      setOrders((data as OrderRow[]) ?? []);
      setLoading(false);
    })();
  }, [router]);

  return (
    <AppShell title="Orders">
      <button
        className="rounded-xl border px-4 py-2 bg-white"
        onClick={() => router.push("/account")}
        type="button"
      >
        ← Back to account
      </button>

      {msg ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div>
      ) : null}

      <div className="mt-4 rounded-2xl border bg-white p-5">
        <p className="text-lg font-semibold">Your orders</p>
        <p className="mt-1 text-sm text-gray-600">
          Total {counts.total} · Food {counts.food} · Products {counts.products}
        </p>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border bg-white p-5 text-sm text-gray-600">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="mt-4 rounded-2xl border bg-white p-5 text-sm text-gray-600">No orders yet.</div>
      ) : (
        <div className="mt-4 grid gap-3">
          {orders.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => router.push(`/orders/${o.id}`)}
              className="rounded-2xl border bg-white p-4 text-left hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold">{labelForOrder(o)}</p>
                <p className="font-bold">{naira(o.total ?? 0)}</p>
              </div>

              <div className="mt-1 flex items-center justify-between text-sm text-gray-600">
                <span>{friendlyStatus(o.status)}</span>
                <span>{fmtDate(o.created_at)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{typeForOrder(o)}</p>
            </button>
          ))}
        </div>
      )}

      <div className="h-3" />
    </AppShell>
  );
}
