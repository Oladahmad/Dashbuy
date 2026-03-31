"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { parseManualLogisticsNotes } from "@/lib/manualLogistics";
import { extractOrderNameFromNotes } from "@/lib/orderName";
import { resolveTrackingStatus } from "@/lib/orderTracking";
import OrderTimeline from "@/components/OrderTimeline";

type OrderRow = {
  id: string;
  status: string | null;
  total: number | null;
  customer_phone: string | null;
  delivery_address: string | null;
  notes: string | null;
  created_at: string;
};

type JobRow = {
  id: string;
  status: "pending_pickup" | "picked_up" | "delivered" | "cancelled";
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

export default function LogisticsManualOrderDetailsPage() {
  const params = useParams<{ orderId?: string }>();
  const router = useRouter();
  const orderId = String(params?.orderId ?? "");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!orderId) return;
    setLoading(true);
    setMsg("");

    const { data: row, error } = await supabase
      .from("orders")
      .select("id,status,total,customer_phone,delivery_address,notes,created_at")
      .eq("id", orderId)
      .maybeSingle<OrderRow>();
    if (error) {
      setMsg(error.message);
      setOrder(null);
      setLoading(false);
      return;
    }
    if (!row) {
      setMsg("Order not found.");
      setOrder(null);
      setLoading(false);
      return;
    }

    const manual = parseManualLogisticsNotes(row.notes);
    if (!manual.isManual) {
      setMsg("This is not a manual logistics order.");
      setOrder(null);
      setLoading(false);
      return;
    }

    const { data: jobRow } = await supabase
      .from("logistics_jobs")
      .select("id,status")
      .eq("order_id", orderId)
      .maybeSingle<JobRow>();

    setOrder(row);
    setJob(jobRow ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [orderId]);

  const manual = useMemo(() => parseManualLogisticsNotes(order?.notes), [order?.notes]);
  const orderName = extractOrderNameFromNotes(order?.notes) || "Delivery order";
  const effectiveStatus = resolveTrackingStatus(order?.status, job?.status ?? null);
  const trackingBase =
    (process.env.NEXT_PUBLIC_TRACKING_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const trackingLink =
    typeof window !== "undefined"
      ? `${trackingBase || window.location.origin}/track/${orderId}`
      : `${trackingBase}/track/${orderId}`;

  const primaryAction = useMemo(() => {
    if (!order) return null;
    if (String(order.status ?? "") === "pending_vendor") {
      return { key: "accept", label: "Accept order", run: acceptOrder };
    }
    if (job?.status === "pending_pickup") {
      return { key: "pickup", label: "Mark picked up", run: () => setJobStatus("picked_up") };
    }
    if (job?.status === "picked_up") {
      return { key: "delivered", label: "Mark delivered", run: () => setJobStatus("delivered") };
    }
    return null;
  }, [order, job]);

  async function copyTrackingLink() {
    try {
      await navigator.clipboard.writeText(trackingLink);
      setMsg("Tracking link copied.");
    } catch {
      setMsg("Could not copy tracking link.");
    }
  }

  function sendTrackingViaWhatsApp() {
    const text = encodeURIComponent(
      `Hello,\nTrack your Dashbuy delivery with this link:\n${trackingLink}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  async function acceptOrder() {
    if (!order) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/logistics/manual-orders/accept", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orderId: order.id }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      setBusy(false);
      setMsg(body?.error ?? "Failed to accept order.");
      return;
    }

    setBusy(false);
    await load();
  }

  async function setJobStatus(nextStatus: "picked_up" | "delivered") {
    if (!job) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      router.push("/auth/login");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/logistics/jobs/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jobId: job.id, nextStatus }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      setBusy(false);
      setMsg(body?.error ?? "Failed to update status.");
      return;
    }
    setBusy(false);
    await load();
  }

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-lg font-semibold">Manual order details</p>
            <p className="mt-1 text-sm text-gray-600">Order ID: {orderId}</p>
          </div>
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/logistics/manual")}>
            Back
          </button>
        </div>
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading...</div> : null}
      {msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}

      {order ? (
        <>
          <OrderTimeline
            status={effectiveStatus}
            title={orderName}
            subtitle={`${naira(Number(order.total ?? 0))} · Ref ${order.id.slice(0, 8)}`}
          />

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Customer</p>
            <p className="mt-2 text-sm">{manual.customerName || "Customer"}</p>
            <p className="mt-1 text-sm">Phone: {order.customer_phone || "-"}</p>
            <p className="mt-1 text-sm">Address: {order.delivery_address || "-"}</p>
            <p className="mt-1 text-sm text-gray-600">Created: {new Date(order.created_at).toLocaleString()}</p>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Items requested</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{manual.itemsText || "-"}</pre>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Tracking link</p>
            <p className="mt-1 break-all text-sm">{trackingLink}</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-xs"
                onClick={copyTrackingLink}
              >
                Copy link
              </button>
              <button
                type="button"
                className="rounded-lg border px-3 py-2 text-xs"
                onClick={sendTrackingViaWhatsApp}
              >
                Send via WhatsApp
              </button>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Actions</p>
            {primaryAction ? (
              <button
                type="button"
                className="mt-3 rounded-xl bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
                onClick={primaryAction.run}
                disabled={busy}
              >
                {busy ? "Processing..." : primaryAction.label}
              </button>
            ) : (
              <p className="mt-3 text-sm text-gray-600">No pending action. This order is fully completed.</p>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}
