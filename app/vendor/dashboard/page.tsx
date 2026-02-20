/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AppShell from "@/components/AppShell";

type Vendor = { id: string; name: string };
type OrderRow = {
  id: string;
  status: string;
  total: number | null;
  total_amount: number | null;
  subtotal: number | null;
  delivery_fee: number | null;
  created_at: string;
  order_type: string;
};

function naira(n: number) {
  return `₦${Math.round(n).toLocaleString()}`;
}

function shortId(id: string) {
  return id.slice(0, 8);
}

function safeNumber(x: unknown, fallback = 0) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function commissionBase(o: OrderRow) {
  const subtotal = safeNumber(o.subtotal, 0);
  if (subtotal > 0) return subtotal;
  const total = safeNumber(o.total_amount ?? o.total, 0);
  const delivery = safeNumber(o.delivery_fee, 0);
  return Math.max(0, total - delivery);
}

export default function VendorDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [productsCount, setProductsCount] = useState<number>(0);

  const pendingCount = useMemo(
    () => orders.filter((o) => ["pending_vendor", "preparing", "ready"].includes(o.status)).length,
    [orders]
  );

  const totalRevenue = useMemo(() => {
    return orders
      .filter((o) => o.status !== "pending_payment")
      .reduce((sum, o) => {
        const base = commissionBase(o);
        return sum + Math.max(0, Math.round(base - base * 0.05));
      }, 0);
  }, [orders]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        setMsg("Please login first at /auth");
        setLoading(false);
        return;
      }

      const { data: v, error: vErr } = await supabase
        .from("vendors")
        .select("id,name")
        .eq("owner_id", userId)
        .single();

      if (vErr || !v) {
        setMsg("No vendor profile found. Go and create one.");
        setLoading(false);
        return;
      }

      setVendor(v);

      const { data: o, error: oErr } = await supabase
        .from("orders")
        .select("id,status,total,total_amount,subtotal,delivery_fee,created_at,order_type")
        .eq("vendor_id", v.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (oErr) {
        setMsg("Orders error: " + oErr.message);
        setLoading(false);
        return;
      }

      setOrders((o as OrderRow[]) ?? []);

      const { count } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("vendor_id", v.id);

      setProductsCount(count ?? 0);
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell title="Vendor dashboard">
      {loading ? (
        <div className="rounded-2xl border bg-white p-4">Loading...</div>
      ) : (
        <>
          {/* Top card */}
          <div className="rounded-2xl border bg-white p-5">
            <p className="text-xs text-gray-500">Welcome</p>
            <h1 className="mt-1 text-2xl font-bold">{vendor?.name ?? "Vendor"}</h1>
            <p className="mt-2 text-sm text-gray-600">
              Manage products, foods, and orders in one place.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <a href="/vendor/products" className="rounded-xl bg-orange-600 px-4 py-2 text-sm text-white">
                Add product
              </a>
              <a href="/vendor/foods" className="rounded-xl border px-4 py-2 text-sm">
                Add food
              </a>
              <a href="/vendor/orders" className="rounded-xl border px-4 py-2 text-sm">
                View orders
              </a>
            </div>
          </div>

          {msg ? (
            <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div>
          ) : null}

          {/* Stats */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4">
              <p className="text-xs text-gray-500">Total revenue</p>
              <p className="mt-2 text-2xl font-bold">{naira(totalRevenue)}</p>
              <p className="mt-1 text-xs text-gray-500">Paid orders</p>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <p className="text-xs text-gray-500">Pending orders</p>
              <p className="mt-2 text-2xl font-bold">{pendingCount}</p>
              <p className="mt-1 text-xs text-gray-500">Need your action</p>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <p className="text-xs text-gray-500">Products listed</p>
              <p className="mt-2 text-2xl font-bold">{productsCount}</p>
              <p className="mt-1 text-xs text-gray-500">In your store</p>
            </div>
          </div>

          {/* Recent orders */}
          <div className="mt-4 rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Recent orders</h2>
              <a className="text-sm text-orange-600 underline" href="/vendor/orders">
                See all
              </a>
            </div>

            {orders.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">No orders yet.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {orders.slice(0, 8).map((o) => (
                  <div key={o.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          #{shortId(o.id)}{" "}
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                            {o.order_type}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-gray-500">{new Date(o.created_at).toLocaleString()}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-bold">{naira(commissionBase(o))}</p>
                        <p className="mt-1 text-xs text-gray-600">{o.status}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
