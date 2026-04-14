"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

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

const HIDDEN_HISTORY_KEY = "dashbuy_hidden_logistics_history_ids";

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

export default function HistoryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [jobs, setJobs] = useState<LogisticsJobRow[]>([]);
  const [filter, setFilter] = useState<"all" | "delivered" | "cancelled">("all");
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(HIDDEN_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setHiddenIds(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : []);
    } catch {
      setHiddenIds([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HIDDEN_HISTORY_KEY, JSON.stringify(hiddenIds));
  }, [hiddenIds]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg(null);

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (sessionErr || !token) {
        if (alive) {
          setMsg("Not signed in");
          setLoading(false);
        }
        return;
      }

      const resp = await fetch("/api/logistics/jobs?status=history", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await resp.json().catch(() => null)) as { ok?: boolean; error?: string; jobs?: LogisticsJobRow[] } | null;

      if (!alive) return;

      if (!resp.ok || !body?.ok || !Array.isArray(body.jobs)) {
        setMsg(body?.error ?? "Failed to load logistics history");
        setJobs([]);
        setLoading(false);
        return;
      }

      setJobs(body.jobs);
      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const visibleJobs = useMemo(() => jobs.filter((j) => !hiddenIds.includes(j.id)), [jobs, hiddenIds]);

  const filtered = useMemo(() => {
    if (filter === "all") return visibleJobs;
    return visibleJobs.filter((j) => j.status === filter);
  }, [visibleJobs, filter]);

  const counts = useMemo(() => {
    const delivered = visibleJobs.filter((j) => j.status === "delivered").length;
    const cancelled = visibleJobs.filter((j) => j.status === "cancelled").length;
    return { all: visibleJobs.length, delivered, cancelled };
  }, [visibleJobs]);

  function hideItem(jobId: string) {
    setHiddenIds((prev) => (prev.includes(jobId) ? prev : [...prev, jobId]));
  }

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold">History</p>
            <p className="text-sm text-gray-600 mt-1">Delivered and cancelled jobs</p>
          </div>

          <button
            type="button"
            className="rounded-xl border px-3 py-2 text-sm"
            onClick={() => router.push("/logistics")}
          >
            Back
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            className={`rounded-xl border px-4 py-3 text-sm ${filter === "all" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setFilter("all")}
          >
            All ({counts.all})
          </button>

          <button
            type="button"
            className={`rounded-xl border px-4 py-3 text-sm ${filter === "delivered" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setFilter("delivered")}
          >
            Delivered ({counts.delivered})
          </button>

          <button
            type="button"
            className={`rounded-xl border px-4 py-3 text-sm ${filter === "cancelled" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setFilter("cancelled")}
          >
            Cancelled ({counts.cancelled})
          </button>
        </div>

        {msg ? <p className="text-sm text-red-600 mt-3">{msg}</p> : null}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        {loading ? (
          <p className="text-sm text-gray-600">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-600">No history yet</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((j) => {
              const vendorName = cleanText(j.vendor_name) ? j.vendor_name : "Vendor";
              const deliveryAddress = cleanText(j.delivery_address) ? j.delivery_address : "No delivery address";
              const customerNote = cleanText(j.customer_note) ? j.customer_note : null;
              const gross = safeNumber(j.order_total, 0);

              return (
                <div key={j.id} className="rounded-2xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left rounded-xl hover:bg-gray-50"
                      onClick={() => router.push(`/logistics/history/${j.id}`)}
                    >
                      <p className="font-semibold truncate">{orderLabel(j)}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Updated {fmtDateTime(j.updated_at)} · {j.order_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-gray-600 mt-2 truncate">Vendor: {vendorName}</p>
                      <p className="text-xs text-gray-600 truncate">Delivery: {deliveryAddress}</p>
                      {customerNote ? <p className="text-xs text-gray-600 truncate">Note: {customerNote}</p> : null}
                    </button>

                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{naira(gross)}</p>
                      <p className="text-xs text-gray-600 mt-1">{j.status}</p>
                      <button
                        type="button"
                        className="mt-3 rounded-xl border px-3 py-2 text-xs"
                        onClick={() => hideItem(j.id)}
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
