"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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

export default function AdminCustomFoodRequestDetailsPage() {
  const params = useParams<{ requestId?: string }>();
  const requestId = String(params?.requestId ?? "");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(0);

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
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            requests?: RequestRow[];
            items?: ItemRow[];
            orderDeliveryFee?: Array<{ id: string; delivery_fee: number | null; notes: string | null }>;
          }
        | null;

      if (!res.ok || !body?.ok) {
        setMsg(body?.error ?? "Failed to load request.");
        setLoading(false);
        return;
      }

      const reqRow = (body.requests ?? []).find((row) => row.id === requestId) ?? null;
      if (!reqRow) {
        setMsg("Request not found.");
        setLoading(false);
        return;
      }

      const itemRows = (body.items ?? []).filter((row) => row.request_id === requestId);
      const fee =
        (body.orderDeliveryFee ?? []).find((row) => row.id === reqRow.order_id)?.delivery_fee ?? 0;

      setRequest(reqRow);
      setItems(itemRows);
      setDeliveryFee(Number(fee || 0));
      setLoading(false);
    })();
  }, [requestId]);

  const foodAmount = useMemo(
    () => Number(request?.items_subtotal || 0) + Number(request?.plate_fee || 0),
    [request]
  );

  return (
    <main className="space-y-4">
      <Link href="/admin/custom-food-requests" className="inline-block rounded-xl border px-4 py-2 text-sm">
        Back
      </Link>

      {loading ? <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading...</div> : null}
      {msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}

      {!loading && !msg && request ? (
        <>
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-gray-600">Order ID</p>
                <p className="font-semibold">{request.order_id}</p>
              </div>
              <p className="text-xs text-gray-500">{new Date(request.created_at).toLocaleString()}</p>
            </div>
            <p className="mt-2 text-sm text-gray-700">{request.restaurant_name}</p>
            <p className="text-xs text-gray-500">{request.plate_name}</p>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Requested foods</p>
            <div className="mt-3 space-y-2">
              {items.map((it) => (
                <div key={it.id} className="rounded-xl border p-3 flex items-center justify-between text-sm">
                  <span>
                    {it.food_name} x {it.units}
                  </span>
                  <span>{naira(it.line_total)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <div className="flex justify-between text-sm">
              <span>Items + plate fee</span>
              <span className="font-semibold">{naira(foodAmount)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span>Delivery fee</span>
              <span className="font-semibold">{naira(deliveryFee)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span>Grand total</span>
              <span className="font-semibold">{naira(foodAmount + deliveryFee)}</span>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
