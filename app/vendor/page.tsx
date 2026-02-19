"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Role = "customer" | "vendor_food" | "vendor_products" | "admin";

type Profile = {
  id: string;
  role: Role;
};

type UnknownRow = Record<string, unknown>;

function pickNumber(row: UnknownRow, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

function pickString(row: UnknownRow, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

function formatNaira(n: number) {
  const value = Math.max(0, Math.floor(n));
  return "N" + value.toLocaleString();
}

function isDeliveredStatus(status: string) {
  return status.toLowerCase() === "delivered";
}

function isPaidStatus(status: string) {
  const s = status.toLowerCase();
  return !["pending_payment", "rejected", "declined", "cancelled", "refunded"].includes(s);
}

function isPendingPaymentStatus(status: string) {
  return status.toLowerCase() === "pending_payment";
}

export default function VendorDashboardPage() {
  const [role, setRole] = useState<Role>("vendor_food");

  const [orders, setOrders] = useState<UnknownRow[]>([]);
  const [uploads, setUploads] = useState<UnknownRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isFoodVendor = role === "vendor_food" || role === "admin";

  const uploadLabel = isFoodVendor ? "food" : "product";
  const addHref = isFoodVendor ? "/vendor/food/new" : "/vendor/products/new";
  const uploadsHref = isFoodVendor ? "/vendor/food" : "/vendor/products";

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);

      const { data: u } = await supabase.auth.getUser();
      const user = u.user;

      if (!user) {
        if (alive) setLoading(false);
        return;
      }

      const { data: p } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle<Profile>();

      const r = (p?.role ?? "customer") as Role;
      if (!alive) return;

      setRole(r);

      const vendorId = user.id;

      const { data: o } = await supabase
        .from("orders")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("created_at", { ascending: false })
        .limit(20);

      const ordersRows = (o ?? []) as UnknownRow[];

      if (!alive) return;
      setOrders(ordersRows);

      if (r === "vendor_products") {
        const { data: pr } = await supabase
          .from("products")
          .select("*")
          .eq("vendor_id", vendorId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!alive) return;
        setUploads((pr ?? []) as UnknownRow[]);
      } else {
        const { data: fi } = await supabase
          .from("food_items")
          .select("*")
          .eq("vendor_id", vendorId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (!alive) return;
        setUploads((fi ?? []) as UnknownRow[]);
      }

      if (alive) setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const summary = useMemo(() => {
    const rows = orders.map((row) => {
      const status = pickString(row, ["status"]) || "pending_payment";
      const amount = pickNumber(row, ["total_amount", "total", "amount", "grand_total", "subtotal"]);
      const net = Math.max(0, Math.round(amount - amount * 0.05));
      return { status, net };
    });

    const settled = rows.filter((r) => isDeliveredStatus(r.status)).reduce((s, r) => s + r.net, 0);
    const pendingConfirmation = rows
      .filter((r) => isPaidStatus(r.status) && !isDeliveredStatus(r.status))
      .reduce((s, r) => s + r.net, 0);

    return {
      ordersCount: rows.filter((r) => !isPendingPaymentStatus(r.status)).length,
      unpaidCount: rows.filter((r) => isPendingPaymentStatus(r.status)).length,
      pendingConfirmation,
      settled,
    };
  }, [orders]);

  const recentUploads = uploads.slice(0, 3);
  const recentOrders = orders.slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm text-gray-600">Summary</p>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Orders</p>
            <p className="mt-1 text-lg font-semibold">{loading ? "..." : summary.ordersCount}</p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Pending confirmation</p>
            <p className="mt-1 text-lg font-semibold">
              {loading ? "..." : formatNaira(summary.pendingConfirmation)}
            </p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Vendor revenue settled</p>
            <p className="mt-1 text-lg font-semibold">{loading ? "..." : formatNaira(summary.settled)}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-600">
          Pending confirmation helps prevent scams until logistics confirms delivery.
        </p>
        {summary.unpaidCount > 0 ? (
          <p className="mt-1 text-xs text-gray-600">{summary.unpaidCount} order(s) are still awaiting customer payment.</p>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Recent uploads</p>
          <Link href={uploadsHref} className="text-sm underline">
            View all
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : recentUploads.length === 0 ? (
            <p className="text-sm text-gray-600">No upload yet</p>
          ) : (
            recentUploads.map((row, idx) => {
              const name = pickString(row, ["name", "title"]) || `${uploadLabel} ${idx + 1}`;
              const createdAt = pickString(row, ["created_at", "inserted_at"]);
              return (
                <div key={idx} className="rounded-xl border p-3">
                  <p className="font-medium">{name}</p>
                  {createdAt ? <p className="text-xs text-gray-500">{createdAt}</p> : null}
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 grid gap-2">
          <Link href={addHref} className="w-full rounded-xl bg-black px-4 py-3 text-center text-white">
            {isFoodVendor ? "Add new food" : "Add new product"}
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Recent orders</p>
          <Link href="/vendor/orders" className="text-sm underline">
            View all
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {loading ? (
            <p className="text-sm text-gray-600">Loading...</p>
          ) : recentOrders.length === 0 ? (
            <p className="text-sm text-gray-600">No orders yet</p>
          ) : (
            recentOrders.map((row, idx) => {
              const id = pickString(row, ["id", "order_id"]) || `order ${idx + 1}`;
              const status = pickString(row, ["status"]) || "pending";
              const createdAt = pickString(row, ["created_at", "inserted_at"]);
              const amount = pickNumber(row, ["total_amount", "total", "amount", "grand_total", "subtotal"]);
              return (
                <div key={idx} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">{id}</p>
                    <p className="text-sm">{formatNaira(amount)}</p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {status}
                    {createdAt ? ` - ${createdAt}` : ""}
                  </p>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4">
          <Link href="/vendor/orders" className="w-full rounded-xl border px-4 py-3 text-center block">
            View orders
          </Link>
        </div>
      </div>
    </div>
  );
}
