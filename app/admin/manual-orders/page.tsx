"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ManualOrderItem = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  status: string | null;
  total: number;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  order_name: string;
  items_text: string;
  created_at: string;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function friendlyStatus(status: string | null) {
  return String(status ?? "").replace(/_/g, " ").trim() || "pending vendor";
}

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function AdminManualOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState<ManualOrderItem[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setMsg("Session expired. Please log in again.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/admin/manual-orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; items?: ManualOrderItem[] } | null;
      if (!res.ok || !body?.ok) {
        setMsg(body?.error ?? "Unable to load manual orders.");
        setItems([]);
        setLoading(false);
        return;
      }

      setItems(body.items ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Vendor manual orders</p>
            <p className="mt-1 text-sm text-gray-600">All manual orders created by vendors across the platform.</p>
          </div>
          <Link href="/admin" className="rounded-xl border px-4 py-2 text-sm">
            Back
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        {loading ? <p className="text-sm text-gray-600">Loading...</p> : null}
        {!loading && msg ? <p className="text-sm text-red-600">{msg}</p> : null}
        {!loading && !msg && items.length === 0 ? <p className="text-sm text-gray-600">No vendor manual orders yet.</p> : null}

        {!loading && !msg && items.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border">
            <div className="hidden grid-cols-[120px_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_120px_120px] gap-3 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid">
              <span>Order ID</span>
              <span>Order</span>
              <span>Vendor</span>
              <span>Customer</span>
              <span>Amount</span>
              <span>Status</span>
            </div>

            <div className="divide-y">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/manual-orders/${item.id}`}
                  className="block px-4 py-3 text-sm transition hover:bg-gray-50"
                >
                  <div className="hidden grid-cols-[120px_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_120px_120px] items-center gap-3 md:grid">
                    <p className="truncate font-semibold text-black">{item.id.slice(0, 8)}</p>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900">{item.order_name}</p>
                      <p className="mt-1 text-xs text-gray-500">{fmtDate(item.created_at)}</p>
                    </div>
                    <p className="truncate text-gray-700">{item.vendor_name}</p>
                    <p className="truncate text-gray-700">{item.customer_name}</p>
                    <p className="font-semibold text-gray-900">{naira(item.total)}</p>
                    <p className="truncate text-xs capitalize text-gray-600">{friendlyStatus(item.status)}</p>
                  </div>

                  <div className="space-y-2 md:hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-black">{item.id.slice(0, 8)}</p>
                        <p className="mt-1 truncate text-sm font-medium text-gray-900">{item.order_name}</p>
                      </div>
                      <p className="shrink-0 font-semibold text-gray-900">{naira(item.total)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                      <p className="truncate">Vendor: {item.vendor_name}</p>
                      <p className="truncate">Customer: {item.customer_name}</p>
                      <p className="truncate capitalize">Status: {friendlyStatus(item.status)}</p>
                      <p className="truncate">{fmtDate(item.created_at)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
