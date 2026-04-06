"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

export default function AdminManualOrderDetailsPage() {
  const params = useParams<{ orderId?: string }>();
  const orderId = String(params?.orderId ?? "");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [item, setItem] = useState<ManualOrderItem | null>(null);

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
        setMsg(body?.error ?? "Unable to load manual order.");
        setLoading(false);
        return;
      }

      const found = (body.items ?? []).find((entry) => entry.id === orderId) ?? null;
      if (!found) {
        setMsg("Manual order not found.");
        setLoading(false);
        return;
      }

      setItem(found);
      setLoading(false);
    })();
  }, [orderId]);

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Manual order details</p>
            <p className="mt-1 text-sm text-gray-600">Order ID: {orderId}</p>
          </div>
          <Link href="/admin/manual-orders" className="rounded-xl border px-4 py-2 text-sm">
            Back
          </Link>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading...</div> : null}
      {!loading && msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}

      {!loading && item ? (
        <>
          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">{item.order_name}</p>
            <p className="mt-2 text-sm">Vendor: {item.vendor_name}</p>
            <p className="mt-1 text-sm">Customer: {item.customer_name}</p>
            <p className="mt-1 text-sm">Phone: {item.customer_phone || "-"}</p>
            <p className="mt-1 text-sm">Address: {item.delivery_address || "-"}</p>
            <p className="mt-1 text-sm">Status: {friendlyStatus(item.status)}</p>
            <p className="mt-1 text-sm">Total: {naira(item.total)}</p>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Items requested</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{item.items_text || "-"}</pre>
          </div>
        </>
      ) : null}
    </main>
  );
}
