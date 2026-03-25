"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type RequestRow = {
  id: string;
  order_id: string;
  restaurant_name: string;
  plate_name: string;
  plate_fee: number;
  items_subtotal: number;
  total_amount: number;
  created_at: string;
};

type ItemRow = {
  id: string;
  request_id: string;
  food_name: string;
  units: number;
  unit_price: number;
  line_total: number;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

export default function AdminCustomFoodRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setMsg("Sign in first.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/admin/custom-food-requests", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        requests?: RequestRow[];
        items?: ItemRow[];
      } | null;

      if (!res.ok || !body?.ok) {
        setMsg(body?.error ?? "Failed to load custom food requests.");
        setLoading(false);
        return;
      }

      setRequests(Array.isArray(body.requests) ? body.requests : []);
      setItems(Array.isArray(body.items) ? body.items : []);
      setLoading(false);
    })();
  }, []);

  const itemsByRequest = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const row of items) {
      const existing = map.get(row.request_id) ?? [];
      existing.push(row);
      map.set(row.request_id, existing);
    }
    return map;
  }, [items]);

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <h1 className="text-lg font-semibold">Custom Food Requests (Test Run)</h1>
        <p className="mt-1 text-sm text-gray-600">
          This page lists all customer custom restaurant food requests submitted from the Food page.
        </p>
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading...</div> : null}
      {msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}

      {!loading && !msg ? (
        requests.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">No custom requests yet.</div>
        ) : (
          <div className="grid gap-3">
            {requests.map((req) => (
              <div key={req.id} className="rounded-2xl border bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{req.restaurant_name}</p>
                  <p className="text-xs text-gray-500">{new Date(req.created_at).toLocaleString()}</p>
                </div>
                <p className="mt-1 text-sm text-gray-600">{req.plate_name}</p>
                <p className="mt-1 text-xs text-gray-500">Order ID: {req.order_id}</p>

                <div className="mt-3 rounded-xl border bg-gray-50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Items subtotal</span>
                    <span className="font-semibold">{naira(req.items_subtotal)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span>Plate fee</span>
                    <span className="font-semibold">{naira(req.plate_fee)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span>Total</span>
                    <span className="font-semibold">{naira(req.total_amount)}</span>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  {(itemsByRequest.get(req.id) ?? []).map((it) => (
                    <div key={it.id} className="flex items-center justify-between text-sm">
                      <span>
                        {it.food_name} x {it.units}
                      </span>
                      <span>{naira(it.line_total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </main>
  );
}
