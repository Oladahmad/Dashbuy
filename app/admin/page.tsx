"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Metrics = {
  usersCount: number;
  vendorProductsCount: number;
  vendorFoodCount: number;
};

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [metrics, setMetrics] = useState<Metrics>({
    usersCount: 0,
    vendorProductsCount: 0,
    vendorFoodCount: 0,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (alive) {
          setMsg("Session expired. Please log in again.");
          setLoading(false);
        }
        return;
      }

      const res = await fetch("/api/admin/metrics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; metrics?: Metrics }
        | null;

      if (!alive) return;

      if (!res.ok || !body?.ok || !body.metrics) {
        setMsg(body?.error ?? "Unable to load metrics.");
        setLoading(false);
        return;
      }

      setMetrics(body.metrics);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-black via-neutral-900 to-neutral-800 p-5 text-white">
        <p className="text-xs uppercase tracking-[0.2em] text-white/70">Dashbuy Admin</p>
        <p className="mt-2 text-2xl font-semibold">Platform Metrics</p>
        <p className="mt-1 text-sm text-white/80">Live registration overview for customers and vendors.</p>
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading metrics...</div> : null}
      {!loading && msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}

      {!loading && !msg ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Users</p>
            <p className="mt-2 text-4xl font-bold text-black">{metrics.usersCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">Customer accounts</p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Product vendors</p>
            <p className="mt-2 text-4xl font-bold text-black">{metrics.vendorProductsCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">Registered product sellers</p>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">Food vendors</p>
            <p className="mt-2 text-4xl font-bold text-black">{metrics.vendorFoodCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">Registered food sellers</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-4">
        <p className="font-semibold">Operations</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link href="/admin/custom-food-requests" className="rounded-xl border px-4 py-3 text-center font-medium hover:bg-gray-50">
            View custom food requests
          </Link>
        </div>
      </div>
    </div>
  );
}
