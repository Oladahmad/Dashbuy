"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { extractOrderNameFromNotes } from "@/lib/orderName";

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
  const subtotal = safeNumber(o.subtotal, 0);
  if (subtotal > 0) return subtotal;
  const total = safeNumber(o.total_amount ?? o.total, 0);
  const delivery = safeNumber(o.delivery_fee, 0);
  return Math.max(0, total - delivery);
}

function computePlatformFee(gross: number) {
  return Math.round(gross * 0.05);
}

function computeVendorNet(gross: number) {
  const fee = computePlatformFee(gross);
  return Math.max(0, gross - fee);
}

function isPendingPaymentStatus(status: string | null) {
  return (status ?? "").toLowerCase() === "pending_payment";
}

function isPaidStatus(status: string | null) {
  const s = (status ?? "").toLowerCase();
  return !["pending_payment", "rejected", "declined", "cancelled", "refunded"].includes(s);
}

function labelForOrder(o: OrderRow) {
  const fromNotes = extractOrderNameFromNotes(o.notes);
  if (fromNotes) return fromNotes;
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
  if (s === "pending_vendor") return "Paid - waiting your confirmation";
  if (s === "accepted") return "Accepted by vendor";
  if (s === "rejected" || s === "declined") return "Declined";
  if (s === "picked_up") return "Picked up by rider";
  if (s === "pending_pickup") return "Waiting rider pickup";
  if (s === "delivered") return "Delivered";
  if (s === "cancelled") return "Cancelled";
  if (s === "refunded") return "Refunded";
  return status ?? "Unknown";
}

function isSettledStatus(status: string | null) {
  return status === "delivered";
}

function settlementStage(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s === "delivered") return "Delivered and settled";
  if (s === "pending_vendor") return "Pending your confirmation";
  if (s === "accepted" || s === "pending_pickup" || s === "picked_up") return "Await logistics confirmation";
  return "Not settled";
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
        const rows = (data ?? []) as OrderRow[];
        const orderIds = rows.map((r) => r.id);
        if (orderIds.length > 0) {
          const { data: jobs } = await supabase
            .from("logistics_jobs")
            .select("order_id,status")
            .in("order_id", orderIds);

          const deliveredOrderIds = new Set(
            ((jobs ?? []) as Array<{ order_id: string; status: string | null }>)
              .filter((j) => (j.status ?? "").toLowerCase() === "delivered")
              .map((j) => j.order_id)
          );

          for (const row of rows) {
            if (deliveredOrderIds.has(row.id)) row.status = "delivered";
          }
        }
        setOrders(rows);
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

  const payableOrders = useMemo(() => {
    return orders.filter((o) => !isPendingPaymentStatus(o.status));
  }, [orders]);

  const unpaidCount = useMemo(() => {
    return orders.length - payableOrders.length;
  }, [orders.length, payableOrders.length]);

  const filtered = useMemo(() => {
    return payableOrders.filter((o) => {
      if (statusFilter === "all") return true;
      return (o.status ?? "") === statusFilter;
    });
  }, [payableOrders, statusFilter]);

  const stats = useMemo(() => {
    const deliveredOnly = filtered.filter((o) => isSettledStatus(o.status));
    const deliveredNet = deliveredOnly.reduce((s, o) => s + computeVendorNet(computeGross(o)), 0);
    const pendingConfirmationNet = filtered
      .filter((o) => isPaidStatus(o.status) && !isSettledStatus(o.status))
      .reduce((s, o) => s + computeVendorNet(computeGross(o)), 0);

    return {
      count: filtered.length,
      pendingConfirmationNet,
      deliveredNet,
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm text-gray-600">Orders</p>
        <p className="text-base font-semibold">Your customer orders</p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Orders</p>
            <p className="text-lg font-semibold">{stats.count}</p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Pending confirmation</p>
            <p className="text-lg font-semibold">{formatNaira(stats.pendingConfirmationNet)}</p>
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
          Pending confirmation helps prevent scams until logistics confirms delivery.
        </p>
        {unpaidCount > 0 ? (
          <p className="mt-1 text-xs text-gray-600">{unpaidCount} order(s) still awaiting customer payment.</p>
        ) : null}
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
                        {formatDateTime(o.created_at)} · {friendlyStatus(o.status)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{typeForOrder(o)}</p>
                    </div>

                    <div className="text-right">
                      <p className="font-semibold">
                        {isSettledStatus(o.status) ? formatNaira(netIfDelivered) : "Pending confirmation"}
                      </p>
                      <p className="text-xs text-gray-600">{settlementStage(o.status)}</p>
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
