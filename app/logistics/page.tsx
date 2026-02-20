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

  vendor_name: string | null;
  vendor_phone: string | null;
  vendor_address: string | null;

  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;

  order_type: string | null;
  food_mode: string | null;
  order_total: number | null;
  delivery_fee?: number | null;
  customer_note?: string | null;
};

type VendorProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  store_address: string | null;
  store_name: string | null;
};

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

function cleanText(s: string | null | undefined) {
  return String(s ?? "").trim();
}

export default function LogisticsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [jobs, setJobs] = useState<LogisticsJobRow[]>([]);
  const [tab, setTab] = useState<"pending_pickup" | "picked_up">("pending_pickup");

  const [selected, setSelected] = useState<LogisticsJobRow | null>(null);
  const [saving, setSaving] = useState(false);

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
          "id,order_id,vendor_id,customer_id,status,created_at,vendor_name,vendor_phone,vendor_address,customer_name,customer_phone,delivery_address,order_type,food_mode,order_total"
        )
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (error) {
        setMsg(error.message);
        setJobs([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as LogisticsJobRow[];

      const orderIds = Array.from(
        new Set(
          rows
            .map((r) => cleanText(r.order_id))
            .filter((x) => x.length > 0)
        )
      );

      const orderNoteMap = new Map<string, string>();
      const orderDeliveryFeeMap = new Map<string, number>();
      if (orderIds.length > 0) {
        const { data: orderRows, error: orderErr } = await supabase
          .from("orders")
          .select("id,notes,delivery_fee")
          .in("id", orderIds);

        if (!orderErr && orderRows) {
          for (const o of orderRows as Array<{ id: string; notes: string | null; delivery_fee: number | null }>) {
            orderNoteMap.set(o.id, cleanText(o.notes));
            orderDeliveryFeeMap.set(o.id, safeNumber(o.delivery_fee, 0));
          }
        }
      }

      const vendorIds = Array.from(
        new Set(
          rows
            .map((r) => r.vendor_id)
            .filter((x) => cleanText(x).length > 0)
        )
      );

      const vendorMap = new Map<string, VendorProfile>();

      if (vendorIds.length > 0) {
        const { data: vendors, error: vErr } = await supabase
          .from("profiles")
          .select("id,full_name,phone,address,store_address,store_name")
          .in("id", vendorIds);

        if (!vErr && vendors) {
          for (const v of vendors as VendorProfile[]) {
            vendorMap.set(v.id, v);
          }
        }
      }

      const merged = rows.map((j) => {
        const v = vendorMap.get(j.vendor_id);

        const vendorName =
          cleanText(j.vendor_name) ||
          cleanText(v?.store_name) ||
          cleanText(v?.full_name) ||
          "";

        const vendorPhone =
          cleanText(j.vendor_phone) ||
          cleanText(v?.phone) ||
          "";

        const vendorAddress =
          cleanText(j.vendor_address) ||
          cleanText(v?.store_address) ||
          cleanText(v?.address) ||
          "";

        return {
          ...j,
          vendor_name: vendorName || null,
          vendor_phone: vendorPhone || null,
          vendor_address: vendorAddress || null,
          customer_note: orderNoteMap.get(j.order_id) || null,
          delivery_fee: orderDeliveryFeeMap.get(j.order_id) ?? 0,
        };
      });

      setJobs(merged);
      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  const pendingPickupJobs = useMemo(
    () => jobs.filter((j) => j.status === "pending_pickup"),
    [jobs]
  );
  const pickedUpJobs = useMemo(
    () => jobs.filter((j) => j.status === "picked_up"),
    [jobs]
  );
  const deliveredJobs = useMemo(
    () => jobs.filter((j) => j.status === "delivered"),
    [jobs]
  );
  const toDeliverCount = pendingPickupJobs.length + pickedUpJobs.length;
  const deliveredCount = deliveredJobs.length;
  const deliveredEarnings = useMemo(
    () => deliveredJobs.reduce((sum, j) => sum + safeNumber(j.delivery_fee, 0), 0),
    [deliveredJobs]
  );

  const list = tab === "pending_pickup" ? pendingPickupJobs : pickedUpJobs;

  async function setJobStatus(job: LogisticsJobRow, next: JobStatus) {
    setSaving(true);
    setMsg(null);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (sessionErr || !token) {
      setSaving(false);
      setMsg("Not signed in");
      return;
    }

    const resp = await fetch("/api/logistics/jobs/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jobId: job.id, nextStatus: next }),
    });

    const body = (await resp.json()) as { ok?: boolean; error?: string };
    if (!resp.ok || !body.ok) {
      setSaving(false);
      setMsg(body.error ?? "Status update failed");
      return;
    }

    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: next } : j)));
    setSelected((prev) => (prev && prev.id === job.id ? { ...prev, status: next } : prev));
    setSaving(false);

    if (next === "picked_up") setTab("picked_up");
  }

  if (loading) return <main className="p-6">Loading...</main>;

  return (
    <main className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold">Logistics</p>
            <p className="text-sm text-gray-600 mt-1">Assigned and picked up deliveries</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border px-3 py-2 text-sm"
              onClick={() => router.push("/logistics/withdraw")}
            >
              Withdraw
            </button>

            <button
              type="button"
              className="rounded-xl border px-3 py-2 text-sm"
              onClick={() => router.push("/logistics/history")}
            >
              History
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl border px-4 py-3 text-sm ${tab === "pending_pickup" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setTab("pending_pickup")}
          >
            Pending pickup ({pendingPickupJobs.length})
          </button>

          <button
            type="button"
            className={`rounded-xl border px-4 py-3 text-sm ${tab === "picked_up" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setTab("picked_up")}
          >
            Picked up ({pickedUpJobs.length})
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Orders to deliver</p>
            <p className="mt-1 text-lg font-semibold">{toDeliverCount}</p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Delivery successful</p>
            <p className="mt-1 text-lg font-semibold">{deliveredCount}</p>
          </div>

          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Amount made</p>
            <p className="mt-1 text-lg font-semibold">{naira(deliveredEarnings)}</p>
          </div>
        </div>

        {msg ? <p className="text-sm text-red-600 mt-3">{msg}</p> : null}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        {list.length === 0 ? (
          <p className="text-sm text-gray-600">No jobs in this section</p>
        ) : (
          <div className="space-y-2">
            {list.map((j) => {
              const gross = safeNumber(j.order_total, 0);

              const vendorName = cleanText(j.vendor_name) ? j.vendor_name : "Vendor";
              const vendorPhone = cleanText(j.vendor_phone) ? j.vendor_phone : "No vendor phone";
              const vendorAddress = cleanText(j.vendor_address) ? j.vendor_address : "No vendor address";

              const customerName = cleanText(j.customer_name) ? j.customer_name : "Customer";
              const customerPhone = cleanText(j.customer_phone) ? j.customer_phone : "No customer phone";
              const deliveryAddress = cleanText(j.delivery_address) ? j.delivery_address : "No delivery address";
              const customerNote = cleanText(j.customer_note) ? j.customer_note : null;

              return (
                <button
                  key={j.id}
                  type="button"
                  className="w-full text-left rounded-2xl border p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelected(j)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{orderLabel(j)}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {fmtDateTime(j.created_at)} · {j.order_id.slice(0, 8)}
                      </p>

                      <p className="text-xs text-gray-600 mt-2 truncate">Vendor: {vendorName}</p>
                      <p className="text-xs text-gray-600 truncate">Vendor phone: {vendorPhone}</p>
                      <p className="text-xs text-gray-600 truncate">Vendor address: {vendorAddress}</p>

                      <p className="text-xs text-gray-600 mt-2 truncate">Customer: {customerName}</p>
                      <p className="text-xs text-gray-600 truncate">Customer phone: {customerPhone}</p>

                      <p className="text-xs text-gray-600 mt-2 truncate">Delivery: {deliveryAddress}</p>
                      {customerNote ? (
                        <p className="text-xs text-gray-600 mt-1 truncate">Note: {customerNote}</p>
                      ) : null}
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

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-xl rounded-2xl bg-white border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold">Delivery details</p>
                <p className="text-xs text-gray-600 mt-1">
                  Job {selected.id.slice(0, 8)} · Status {selected.status}
                </p>
              </div>

              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-sm"
                onClick={() => setSelected(null)}
                disabled={saving}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Order</p>
                <p className="text-sm">{orderLabel(selected)}</p>
                <p className="text-sm font-semibold mt-1">{naira(safeNumber(selected.order_total, 0))}</p>
              </div>

              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Vendor</p>
                <p className="text-sm">{cleanText(selected.vendor_name) ? selected.vendor_name : "Vendor"}</p>
                <p className="text-sm mt-1">Phone: {cleanText(selected.vendor_phone) ? selected.vendor_phone : "No vendor phone"}</p>
                <p className="text-sm mt-1">Address: {cleanText(selected.vendor_address) ? selected.vendor_address : "No vendor address"}</p>
              </div>

              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Customer</p>
                <p className="text-sm">{cleanText(selected.customer_name) ? selected.customer_name : "Customer"}</p>
                <p className="text-sm mt-1">Phone: {cleanText(selected.customer_phone) ? selected.customer_phone : "No customer phone"}</p>
                <p className="text-sm mt-1">Delivery address: {cleanText(selected.delivery_address) ? selected.delivery_address : "No delivery address"}</p>
                {cleanText(selected.customer_note) ? (
                  <p className="text-sm mt-1">Note: {selected.customer_note}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-xl bg-black text-white px-4 py-3 text-sm disabled:opacity-50"
                disabled={saving || selected.status !== "pending_pickup"}
                onClick={() => setJobStatus(selected, "picked_up")}
              >
                Mark picked up
              </button>

              <button
                type="button"
                className="rounded-xl border px-4 py-3 text-sm disabled:opacity-50"
                disabled={saving || selected.status !== "picked_up"}
                onClick={() => setJobStatus(selected, "delivered")}
              >
                Mark delivered
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
