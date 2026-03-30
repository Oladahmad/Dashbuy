"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { extractOrderNameFromNotes, fallbackFoodOrderName } from "@/lib/orderName";
import { parseErrandQuote } from "@/lib/errandQuote";

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

function quoteStatusChip(status: string | null) {
  const s = (status ?? "pending").toLowerCase();
  if (s === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "quoted") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function quoteStatusLabel(status: string | null) {
  const s = (status ?? "pending").toLowerCase();
  if (s === "approved") return "Approved";
  if (s === "quoted") return "Quoted";
  return "Pending quote";
}

export default function AdminCustomFoodRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [orderDeliveryFee, setOrderDeliveryFee] = useState<
    Array<{
      id: string;
      delivery_fee: number | null;
      subtotal: number | null;
      total: number | null;
      status: string | null;
      notes: string | null;
    }>
  >([]);

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
        orderDeliveryFee?: Array<{
          id: string;
          delivery_fee: number | null;
          subtotal: number | null;
          total: number | null;
          status: string | null;
          notes: string | null;
        }>;
      } | null;

      if (!res.ok || !body?.ok) {
        setMsg(body?.error ?? "Failed to load custom food requests.");
        setLoading(false);
        return;
      }

      setRequests(Array.isArray(body.requests) ? body.requests : []);
      setItems(Array.isArray(body.items) ? body.items : []);
      setOrderDeliveryFee(Array.isArray(body.orderDeliveryFee) ? body.orderDeliveryFee : []);
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

  const summary = useMemo(() => {
    const foodAmount = requests.reduce(
      (sum, r) => sum + Number(r.items_subtotal || 0) + Number(r.plate_fee || 0),
      0
    );
    const feeMap = new Map(orderDeliveryFee.map((row) => [row.id, Number(row.delivery_fee || 0)]));
    const deliveryFee = requests.reduce((sum, r) => sum + (feeMap.get(r.order_id) ?? 0), 0);
    const grandTotal = foodAmount + deliveryFee;
    return { foodAmount, deliveryFee, grandTotal };
  }, [requests, orderDeliveryFee]);

  const orderNameByOrderId = useMemo(() => {
    const notesMap = new Map(orderDeliveryFee.map((row) => [row.id, row.notes]));
    const map = new Map<string, string>();
    for (const req of requests) {
      const fromNotes = extractOrderNameFromNotes(notesMap.get(req.order_id) ?? "");
      if (fromNotes) {
        map.set(req.order_id, fromNotes);
        continue;
      }
      const names = (itemsByRequest.get(req.id) ?? []).map((it) => it.food_name).filter(Boolean);
      map.set(req.order_id, fallbackFoodOrderName(names));
    }
    return map;
  }, [orderDeliveryFee, requests, itemsByRequest]);

  const recentOrders = useMemo(() => requests.slice(0, 5), [requests]);
  const orderInfoById = useMemo(() => new Map(orderDeliveryFee.map((row) => [row.id, row])), [orderDeliveryFee]);

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
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs text-gray-600">Items + plate fee</p>
                <p className="mt-1 text-lg font-semibold">{naira(summary.foodAmount)}</p>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs text-gray-600">Delivery fee</p>
                <p className="mt-1 text-lg font-semibold">{naira(summary.deliveryFee)}</p>
              </div>
              <div className="rounded-xl border bg-white p-3">
                <p className="text-xs text-gray-600">Grand total</p>
                <p className="mt-1 text-lg font-semibold">{naira(summary.grandTotal)}</p>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <p className="font-semibold">Recent request orders</p>
              <div className="mt-3 grid gap-2">
                {recentOrders.map((req) => (
                  <Link href={`/admin/custom-food-requests/${req.id}`} key={`recent-${req.id}`} className="block rounded-xl border p-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{orderNameByOrderId.get(req.order_id) || "Food order"}</p>
                      <p className="text-sm font-semibold">{naira(req.total_amount)}</p>
                    </div>
                    <div className="mt-1">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${quoteStatusChip(
                          parseErrandQuote(orderInfoById.get(req.order_id)?.notes).status
                        )}`}
                      >
                        {quoteStatusLabel(parseErrandQuote(orderInfoById.get(req.order_id)?.notes).status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {req.restaurant_name} - {new Date(req.created_at).toLocaleString()}
                    </p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              {requests.map((req) => (
                <Link key={req.id} href={`/admin/custom-food-requests/${req.id}`} className="block rounded-2xl border bg-white p-4 hover:bg-gray-50">
                  {(() => {
                    const orderInfo = orderInfoById.get(req.order_id);
                    const quoteMeta = parseErrandQuote(orderInfo?.notes);
                    const quotedTotal = Number(orderInfo?.total ?? req.total_amount + Number(orderInfo?.delivery_fee ?? 0));
                    return (
                      <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold truncate">{orderNameByOrderId.get(req.order_id) || "Food order"}</p>
                    <p className="text-xs text-gray-500">{new Date(req.created_at).toLocaleString()}</p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${quoteStatusChip(quoteMeta.status)}`}>
                      {quoteStatusLabel(quoteMeta.status)}
                    </span>
                    <span className="text-xs text-gray-500">Quoted total: {naira(quotedTotal)}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{req.restaurant_name}</p>
                  <p className="mt-1 text-xs text-gray-500">{req.plate_name}</p>

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
                      </>
                    );
                  })()}
                </Link>
              ))}
            </div>
          </div>
        )
      ) : null}
    </main>
  );
}
