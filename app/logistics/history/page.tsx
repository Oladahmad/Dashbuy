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

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg(null);

      const { data: u } = await supabase.auth.getUser();
      const user = u.user;

      if (!user) {
        if (alive) {
          setMsg("Not signed in");
          setLoading(false);
        }
        return;
      }

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        if (alive) {
          setMsg("Profile error: " + pErr.message);
          setLoading(false);
        }
        return;
      }

      const role = String(prof?.role ?? "");
      if (role !== "logistics" && role !== "admin") {
        if (alive) {
          setMsg("You are not authorized for logistics");
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("logistics_jobs")
        .select(
          "id,order_id,vendor_id,customer_id,status,created_at,updated_at,vendor_name,vendor_phone,vendor_address,customer_name,customer_phone,delivery_address,order_type,food_mode,order_total"
        )
        .in("status", ["delivered", "cancelled"])
        .order("updated_at", { ascending: false });

      if (!alive) return;

      if (error) {
        setMsg(error.message);
        setJobs([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as LogisticsJobRow[];

      const orderIds = Array.from(
        new Set(rows.map((r) => cleanText(r.order_id)).filter((x) => x.length > 0))
      );

      const orderNoteMap = new Map<string, string>();
      if (orderIds.length > 0) {
        const { data: orderRows, error: orderErr } = await supabase
          .from("orders")
          .select("id,notes")
          .in("id", orderIds);

        if (!orderErr && orderRows) {
          for (const o of orderRows as Array<{ id: string; notes: string | null }>) {
            orderNoteMap.set(o.id, cleanText(o.notes));
          }
        }
      }

      setJobs(
        rows.map((r) => ({
          ...r,
          customer_note: orderNoteMap.get(r.order_id) || null,
        }))
      );
      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return jobs;
    return jobs.filter((j) => j.status === filter);
  }, [jobs, filter]);

  const counts = useMemo(() => {
    const delivered = jobs.filter((j) => j.status === "delivered").length;
    const cancelled = jobs.filter((j) => j.status === "cancelled").length;
    return { all: jobs.length, delivered, cancelled };
  }, [jobs]);

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
                <button
                  key={j.id}
                  type="button"
                  className="w-full text-left rounded-2xl border p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/logistics/history/${j.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{orderLabel(j)}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Updated {fmtDateTime(j.updated_at)} · {j.order_id.slice(0, 8)}
                      </p>
                      <p className="text-xs text-gray-600 mt-2 truncate">Vendor: {vendorName}</p>
                      <p className="text-xs text-gray-600 truncate">Delivery: {deliveryAddress}</p>
                      {customerNote ? <p className="text-xs text-gray-600 truncate">Note: {customerNote}</p> : null}
                    </div>

                    <div className="text-right">
                      <p className="font-semibold">{naira(gross)}</p>
                      <p className="text-xs text-gray-600 mt-1">{j.status}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
