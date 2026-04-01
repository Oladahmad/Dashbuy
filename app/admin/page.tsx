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
      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm text-gray-600">Admin metrics</p>
        <p className="text-base font-semibold">Registration overview</p>
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading metrics...</div> : null}
      {!loading && msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}

      {!loading && !msg ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-4">
            <p className="text-xs text-gray-600">Users</p>
            <p className="mt-2 text-2xl font-semibold">{metrics.usersCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">Customer accounts</p>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="text-xs text-gray-600">Product vendors</p>
            <p className="mt-2 text-2xl font-semibold">{metrics.vendorProductsCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">Registered product sellers</p>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="text-xs text-gray-600">Food vendors</p>
            <p className="mt-2 text-2xl font-semibold">{metrics.vendorFoodCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">Registered food sellers</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-4">
        <p className="font-semibold">Operations</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link href="/admin/custom-food-requests" className="rounded-xl border px-4 py-3 text-center hover:bg-gray-50">
            View custom food requests
          </Link>
        </div>
      </div>
    </div>
  );
}
