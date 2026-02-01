"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type OrderRow = {
  id: string;
  order_type: "food" | "product";
  food_mode: "plate" | "combo" | null;
  customer_id: string;
  vendor_id: string;
  status: string | null;
  subtotal: number | null;
  delivery_fee: number | null;
  total: number | null;
  total_amount: number | null;
  delivery_address: string | null;
  customer_phone: string | null;
  notes: string | null;
  created_at: string;
};

function safeNumber(x: unknown, fallback = 0) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function formatNaira(n: number) {
  const v = Math.max(0, Math.floor(n));
  return "₦" + v.toLocaleString();
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function computeGross(o: OrderRow) {
  return safeNumber(o.total_amount ?? o.total, 0);
}

function computePlatformFee(gross: number) {
  return Math.round(gross * 0.05);
}

function computeVendorNet(gross: number) {
  const fee = computePlatformFee(gross);
  return Math.max(0, gross - fee);
}

function labelForOrder(o: OrderRow) {
  if (o.order_type === "product") return "Products";
  if ((o.food_mode ?? "plate") === "combo") return "Food combo";
  return "Food plate";
}

function isSettledStatus(status: string | null) {
  return status === "delivered";
}

export default function VendorOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | string>("all");

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErr(null);

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (!session || sessionErr) {
        if (alive) {
          setErr("Not signed in");
          setOrders([]);
          setLoading(false);
        }
        return;
      }

      const userId = session.user.id;

      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,order_type,food_mode,customer_id,vendor_id,status,subtotal,delivery_fee,total,total_amount,delivery_address,customer_phone,notes,created_at"
        )
        .eq("vendor_id", userId)
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (error) {
        setErr(error.message);
        setOrders([]);
      } else {
        setOrders((data ?? []) as OrderRow[]);
      }

      setLoading(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter === "all") return true;
      return (o.status ?? "") === statusFilter;
    });
  }, [orders, statusFilter]);

  const stats = useMemo(() => {
    const grossAll = filtered.reduce((s, o) => s + computeGross(o), 0);

    const deliveredOnly = filtered.filter((o) => isSettledStatus(o.status));
    const deliveredGross = deliveredOnly.reduce((s, o) => s + computeGross(o), 0);
    const deliveredFee = deliveredOnly.reduce((s, o) => s + computePlatformFee(computeGross(o)), 0);
    const deliveredNet = deliveredOnly.reduce((s, o) => s + computeVendorNet(computeGross(o)), 0);

    return {
      count: filtered.length,
      grossAll,
      deliveredGross,
      deliveredFee,
      deliveredNet,
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm text-gray-600">Orders</p>
        <p className="text-base font-semibold">Your customer orders</p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Orders</p>
            <p className="text-lg font-semibold">{stats.count}</p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Gross total</p>
            <p className="text-lg font-semibold">{formatNaira(stats.grossAll)}</p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Platform fee settled</p>
            <p className="text-lg font-semibold">{formatNaira(stats.deliveredFee)}</p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Vendor revenue settled</p>
            <p className="text-lg font-semibold">{formatNaira(stats.deliveredNet)}</p>
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs text-gray-600">Status</label>
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="pending_payment">Pending payment</option>
            <option value="pending_vendor">Pending vendor</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="picked_up">Picked up</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>

        <p className="mt-2 text-xs text-gray-600">
          Vendor revenue only increases after delivered.
        </p>
      </div>

      {err ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{err}</div> : null}

      <div className="rounded-2xl border bg-white p-4">
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-600">No orders yet</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => {
              const gross = computeGross(o);
              const netIfDelivered = isSettledStatus(o.status) ? computeVendorNet(gross) : 0;

              return (
                <Link
                  key={o.id}
                  href={`/vendor/orders/${o.id}`}
                  className="block rounded-2xl border p-3 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{labelForOrder(o)}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {formatDateTime(o.created_at)} · {o.status ?? "unknown"}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-semibold">
                        {isSettledStatus(o.status) ? formatNaira(netIfDelivered) : "Not settled"}
                      </p>
                      <p className="text-xs text-gray-600">gross {formatNaira(gross)}</p>
                    </div>
                  </div>

                  {o.delivery_address ? (
                    <p className="text-xs text-gray-600 mt-2 truncate">{o.delivery_address}</p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
