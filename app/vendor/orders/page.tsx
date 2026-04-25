"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { extractOrderNameFromNotes } from "@/lib/orderName";
import { buildVendorPricingMap } from "@/lib/pricing";

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

type OrderListMeta = {
  summary: string;
  buyerName: string;
};

function formatNaira(n: number) {
  const v = Math.max(0, Math.floor(n));
  return "₦" + v.toLocaleString();
}

function isPendingPaymentStatus(status: string | null) {
  return (status ?? "").toLowerCase() === "pending_payment";
}

function isPaidStatus(status: string | null) {
  const s = (status ?? "").toLowerCase();
  return !["pending_payment", "rejected", "declined", "cancelled", "refunded"].includes(s);
}

function uniqueNames(names: string[]) {
  return Array.from(new Set(names.map((x) => x.trim()).filter(Boolean)));
}

function summarizeItems(names: string[]) {
  const unique = uniqueNames(names);
  if (unique.length === 0) return "Order items";
  if (unique.length <= 3) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} +${unique.length - 3} more`;
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

export default function VendorOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderMeta, setOrderMeta] = useState<Record<string, OrderListMeta>>({});
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
      const accessToken = session.access_token ?? "";

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
        setOrderMeta({});
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

        const metaMap: Record<string, OrderListMeta> = {};
        const orderItemNames = new Map<string, string[]>();
        const buyerNamesByOrderId = new Map<string, string>();

        if (orderIds.length > 0) {
          if (accessToken) {
            try {
              const buyersRes = await fetch("/api/vendor/recent-order-buyers", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ orderIds }),
              });
              const buyersBody = (await buyersRes.json()) as {
                ok?: boolean;
                buyersByOrderId?: Record<string, string>;
              };
              if (buyersRes.ok && buyersBody.ok && buyersBody.buyersByOrderId) {
                for (const [orderId, buyerName] of Object.entries(buyersBody.buyersByOrderId)) {
                  const clean = String(buyerName ?? "").trim();
                  if (clean) buyerNamesByOrderId.set(orderId, clean);
                }
              }
            } catch {
              // Keep page functional even if lookup fails.
            }
          }

          const { data: productItems } = await supabase
            .from("order_items")
            .select("order_id,products:product_id(name)")
            .in("order_id", orderIds);
          for (const row of (productItems as Array<Record<string, unknown>> | null) ?? []) {
            const orderId = String(row.order_id ?? "").trim();
            const product = (row.products as { name?: string } | null) ?? null;
            const name = String(product?.name ?? "").trim();
            if (!orderId || !name) continue;
            orderItemNames.set(orderId, [...(orderItemNames.get(orderId) ?? []), name]);
          }

          const { data: comboItems } = await supabase
            .from("combo_order_items")
            .select("order_id,food_items:combo_food_id(name)")
            .in("order_id", orderIds);
          for (const row of (comboItems as Array<Record<string, unknown>> | null) ?? []) {
            const orderId = String(row.order_id ?? "").trim();
            const food = (row.food_items as { name?: string } | null) ?? null;
            const name = String(food?.name ?? "").trim();
            if (!orderId || !name) continue;
            orderItemNames.set(orderId, [...(orderItemNames.get(orderId) ?? []), name]);
          }

          const { data: plates } = await supabase.from("order_plates").select("id,order_id").in("order_id", orderIds);
          const plateRows = (plates as Array<{ id: string; order_id: string }> | null) ?? [];
          const plateIds = plateRows.map((p) => p.id).filter(Boolean);
          const orderIdByPlateId = new Map(plateRows.map((p) => [p.id, p.order_id]));

          if (plateIds.length > 0) {
            const { data: plateItems } = await supabase
              .from("order_plate_items")
              .select("order_plate_id,food_items:food_item_id(name),food_item_variants:variant_id(name)")
              .in("order_plate_id", plateIds);
            for (const row of (plateItems as Array<Record<string, unknown>> | null) ?? []) {
              const plateId = String(row.order_plate_id ?? "").trim();
              const orderId = orderIdByPlateId.get(plateId) ?? "";
              const food = (row.food_items as { name?: string } | null) ?? null;
              const variant = (row.food_item_variants as { name?: string } | null) ?? null;
              const base = String(food?.name ?? "").trim();
              const variantName = String(variant?.name ?? "").trim();
              const name = variantName ? `${base} ${variantName}` : base;
              if (!orderId || !name) continue;
              orderItemNames.set(orderId, [...(orderItemNames.get(orderId) ?? []), name]);
            }
          }
        }

        for (const order of rows) {
          const summary = summarizeItems(orderItemNames.get(order.id) ?? []);
          const buyerName = buyerNamesByOrderId.get(order.id) || "Buyer";
          metaMap[order.id] = { summary, buyerName };
        }

        setOrderMeta(metaMap);
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

  const filtered = useMemo(() => {
    return payableOrders.filter((o) => {
      if (statusFilter === "all") return true;
      return (o.status ?? "") === statusFilter;
    });
  }, [payableOrders, statusFilter]);

  const pricingMap = useMemo(() => buildVendorPricingMap(payableOrders), [payableOrders]);

  const stats = useMemo(() => {
    const deliveredOnly = filtered.filter((o) => isSettledStatus(o.status));
    const deliveredNet = deliveredOnly.reduce((s, o) => s + (pricingMap[o.id]?.net ?? 0), 0);
    const pendingConfirmationNet = filtered
      .filter((o) => isPaidStatus(o.status) && !isSettledStatus(o.status))
      .reduce((s, o) => s + (pricingMap[o.id]?.net ?? 0), 0);

    return {
      count: filtered.length,
      pendingConfirmationNet,
      deliveredNet,
    };
  }, [filtered, pricingMap]);

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
              const shownAmount = pricingMap[o.id]?.net ?? 0;
              const meta = orderMeta[o.id];
              const title = meta?.summary || extractOrderNameFromNotes(o.notes) || "Order items";
              const buyer = meta?.buyerName || "Buyer";

              return (
                <Link
                  key={o.id}
                  href={`/vendor/orders/${o.id}`}
                  className="block rounded-2xl border p-3 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{title}</p>
                      <p className="text-xs text-gray-600 mt-1">Buyer: {buyer}</p>
                      <p className="mt-1 whitespace-nowrap text-xs text-gray-500">Status: {friendlyStatus(o.status)}</p>
                    </div>

                    <div className="text-right">
                      <p className="font-semibold">{formatNaira(shownAmount)}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

