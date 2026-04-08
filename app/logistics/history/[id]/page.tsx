"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import { parseManualLogisticsNotes } from "@/lib/manualLogistics";

type JobStatus = "pending_pickup" | "picked_up" | "delivered" | "cancelled";

type LogisticsJobRow = {
  id: string;
  order_id: string;
  vendor_id: string;
  customer_id: string;

  status: JobStatus;
  created_at: string;
  updated_at: string;

  vendor_name: string | null;
  vendor_phone: string | null;
  vendor_address: string | null;

  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;

  order_type: string | null;
  food_mode: string | null;
  order_total: number | null;
  customer_note?: string | null;
};

type OrderItemLine = {
  id: string;
  kind: "product" | "combo" | "plate";
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  variantName: string | null;
  imageUrl?: string | null;
};

function cleanText(s: string | null | undefined) {
  return String(s ?? "").trim();
}

function safeNumber(x: unknown, fallback = 0) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function preferPositive(primary: unknown, fallback: unknown) {
  const first = safeNumber(primary, 0);
  if (first > 0) return first;
  return safeNumber(fallback, 0);
}

function naira(n: number) {
  const v = Math.max(0, Math.floor(n));
  return "₦" + v.toLocaleString();
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function orderLabel(j: LogisticsJobRow) {
  if (j.order_type === "product") return "Products order";
  if ((j.food_mode ?? "plate") === "combo") return "Food combo order";
  return "Food plate order";
}

export default function HistoryDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [job, setJob] = useState<LogisticsJobRow | null>(null);
  const [items, setItems] = useState<OrderItemLine[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [apiTotal, setApiTotal] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg(null);
      setJob(null);
      setItems([]);
      setApiTotal(null);

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (sessionErr || !token) {
        if (alive) {
          setMsg("Not signed in");
          setLoading(false);
        }
        return;
      }
      const resp = await fetch(`/api/logistics/jobs/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await resp.json().catch(() => null)) as { ok?: boolean; error?: string; job?: LogisticsJobRow } | null;

      if (!alive) return;

      if (!resp.ok || !body?.ok || !body.job) {
        setMsg(body?.error ?? "History item not found");
        setLoading(false);
        return;
      }

      const row = body.job;

      setJob(row);
      setItemsLoading(true);
      const itemsResp = await fetch("/api/orders/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId: row.order_id }),
      });
      const itemsBody = (await itemsResp.json().catch(() => null)) as
        | { ok?: boolean; items?: OrderItemLine[]; order?: { total?: number } }
        | null;
      if (itemsResp.ok && itemsBody?.ok && Array.isArray(itemsBody.items)) {
        setItems(itemsBody.items);
      }
      if (itemsResp.ok && itemsBody?.ok) {
        setApiTotal(safeNumber(itemsBody.order?.total, 0));
      }
      setItemsLoading(false);
      setLoading(false);
    }

    if (id) load();

    return () => {
      alive = false;
    };
  }, [id]);

  const gross = useMemo(() => {
    const jobTotal = safeNumber(job?.order_total, 0);
    if (jobTotal > 0) return jobTotal;
    const fetched = safeNumber(apiTotal, 0);
    if (fetched > 0) return fetched;
    return items.reduce((sum, it) => sum + safeNumber(it.lineTotal, 0), 0);
  }, [job, apiTotal, items]);

  if (loading) return <main className="p-6">Loading...</main>;

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-600">History details</p>
          <p className="text-base font-semibold">{id ? id.slice(0, 8) : ""}</p>
        </div>

        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm"
          onClick={() => router.push("/logistics/history")}
        >
          Back
        </button>
      </div>

      {msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}

      {!job ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">No data</div>
      ) : (
        <>
          <div className="rounded-2xl border bg-white p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{orderLabel(job)}</p>
                <p className="text-xs text-gray-600 mt-1">Order {job.order_id.slice(0, 8)}</p>
              </div>

              <div className="text-right">
                <p className="font-semibold">{naira(gross)}</p>
                <p className="text-xs text-gray-600 mt-1">{job.status}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Created</p>
                <p className="text-sm">{fmtDateTime(job.created_at)}</p>
              </div>

              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Updated</p>
                <p className="text-sm">{fmtDateTime(job.updated_at)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 space-y-2">
            <p className="font-semibold">Vendor</p>

            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Name</p>
              <p className="text-sm">{cleanText(job.vendor_name) ? job.vendor_name : "Vendor"}</p>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Phone</p>
              <p className="text-sm">{cleanText(job.vendor_phone) ? job.vendor_phone : "No vendor phone"}</p>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Address</p>
              <p className="text-sm whitespace-pre-wrap">
                {cleanText(job.vendor_address) ? job.vendor_address : "No vendor address"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 space-y-2">
            <p className="font-semibold">Customer and delivery</p>

            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Name</p>
              <p className="text-sm">{cleanText(job.customer_name) ? job.customer_name : "Customer"}</p>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Phone</p>
              <p className="text-sm">{cleanText(job.customer_phone) ? job.customer_phone : "No customer phone"}</p>
            </div>

            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Delivery address</p>
              <p className="text-sm whitespace-pre-wrap">
                {cleanText(job.delivery_address) ? job.delivery_address : "No delivery address"}
              </p>
            </div>

            {cleanText(job.customer_note) ? (
              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Customer note</p>
                <p className="text-sm whitespace-pre-wrap">{job.customer_note}</p>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border bg-white p-4 space-y-2">
            <p className="font-semibold">Items</p>
            {itemsLoading ? (
              <p className="text-sm text-gray-600">Loading items...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-gray-600">No items found</p>
            ) : (
              <div className="space-y-1">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border bg-gray-50">
                        {it.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.imageUrl} alt={it.name} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <p className="min-w-0 truncate">
                        {it.name}
                        {it.variantName ? ` - ${it.variantName}` : ""} x{it.qty}
                      </p>
                    </div>
                    <p className="font-medium">{naira(safeNumber(it.lineTotal, it.qty * it.unitPrice))}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
