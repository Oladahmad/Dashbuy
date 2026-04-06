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
          <div className="grid gap-3">
            {items.map((item) => (
              <Link key={item.id} href={`/admin/manual-orders/${item.id}`} className="block rounded-2xl border p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{item.order_name}</p>
                    <p className="mt-1 text-sm text-gray-600">{item.customer_name}</p>
                  </div>
                  <p className="font-semibold text-gray-900">{naira(item.total)}</p>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500">
                  <span>{item.vendor_name}</span>
                  <span>{friendlyStatus(item.status)}</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">{fmtDate(item.created_at)}</p>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
