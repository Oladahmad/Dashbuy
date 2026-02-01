"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";

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

export default function HistoryDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [job, setJob] = useState<LogisticsJobRow | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg(null);
      setJob(null);

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
        .eq("id", id)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setMsg("History item not found");
        setLoading(false);
        return;
      }

      setJob(data as LogisticsJobRow);
      setLoading(false);
    }

    if (id) load();

    return () => {
      alive = false;
    };
  }, [id]);

  const gross = useMemo(() => safeNumber(job?.order_total, 0), [job]);

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
          </div>
        </>
      )}
    </main>
  );
}
