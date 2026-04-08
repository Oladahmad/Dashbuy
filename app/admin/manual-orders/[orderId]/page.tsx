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

const STATUS_STEPS = ["pending_vendor", "accepted", "picked_up", "delivered"] as const;

function statusStepIndex(status: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();
  const idx = STATUS_STEPS.indexOf(normalized as (typeof STATUS_STEPS)[number]);
  return idx >= 0 ? idx : 0;
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-gray-500">Order</p>
                <p className="mt-1 break-words text-lg font-semibold">{item.order_name}</p>
                <p className="mt-2 text-sm text-gray-600">Order ID: {item.id}</p>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
                <p className="mt-1 text-xl font-semibold">{naira(item.total)}</p>
                <p className="mt-2 text-sm capitalize text-gray-600">{friendlyStatus(item.status)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Live status</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATUS_STEPS.map((step, index) => {
                const active = index <= statusStepIndex(item.status);
                return (
                  <div
                    key={step}
                    className={`rounded-xl border px-3 py-3 text-center text-sm capitalize ${
                      active ? "border-black bg-black text-white" : "bg-white text-gray-500"
                    }`}
                  >
                    {step.replace(/_/g, " ")}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border bg-white p-4">
              <p className="font-semibold">Vendor</p>
              <p className="mt-3 text-sm">{item.vendor_name || "-"}</p>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <p className="font-semibold">Customer</p>
              <p className="mt-3 text-sm">Name: {item.customer_name || "-"}</p>
              <p className="mt-1 text-sm">Phone: {item.customer_phone || "-"}</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Delivery</p>
            <p className="mt-3 whitespace-pre-wrap text-sm">{item.delivery_address || "-"}</p>
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
