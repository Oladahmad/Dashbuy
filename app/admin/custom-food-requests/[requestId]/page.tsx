"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
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
  if (s === "approved") return "Approved by customer";
  if (s === "quoted") return "Quote sent";
  return "Awaiting admin quote";
}

function stepStyle(active: boolean, done: boolean) {
  if (done) return "border-black bg-black text-white";
  if (active) return "border-black bg-white text-black";
  return "border-gray-300 bg-white text-gray-400";
}

export default function AdminCustomFoodRequestDetailsPage() {
  const params = useParams<{ requestId?: string }>();
  const requestId = String(params?.requestId ?? "");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [orderNotes, setOrderNotes] = useState<string | null>(null);
  const [quotedTotal, setQuotedTotal] = useState<string>("");
  const [savingQuote, setSavingQuote] = useState(false);

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
            orderDeliveryFee?: Array<{
              id: string;
              delivery_fee: number | null;
              subtotal: number | null;
              total: number | null;
              status: string | null;
              notes: string | null;
            }>;
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
      const orderRow = (body.orderDeliveryFee ?? []).find((row) => row.id === reqRow.order_id) ?? null;
      const fee = orderRow?.delivery_fee ?? 0;
      const currentTotal = Number(orderRow?.total ?? reqRow.total_amount + Number(fee || 0));

      setRequest(reqRow);
      setItems(itemRows);
      setDeliveryFee(Number(fee || 0));
      setOrderStatus(orderRow?.status ?? null);
      setOrderNotes(orderRow?.notes ?? null);
      setQuotedTotal(String(Math.max(0, Math.round(currentTotal))));
      setLoading(false);
    })();
  }, [requestId]);

  const foodAmount = useMemo(
    () => Number(request?.items_subtotal || 0) + Number(request?.plate_fee || 0),
    [request]
  );
  const quoteMeta = useMemo(() => parseErrandQuote(orderNotes), [orderNotes]);
  const quotedValue = quoteMeta.quotedTotal ?? Number(request?.total_amount ?? 0) + Number(deliveryFee ?? 0);
  const quoteStatus = quoteMeta.isErrand ? quoteMeta.status ?? "pending" : "pending";
  const isPending = quoteStatus === "pending";
  const isQuoted = quoteStatus === "quoted";
  const isApproved = quoteStatus === "approved";

  async function saveQuote() {
    if (!request) return;
    const q = Number(quotedTotal);
    if (!Number.isFinite(q) || q <= 0) {
      setMsg("Enter a valid quoted total.");
      return;
    }

    setSavingQuote(true);
    setMsg("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setSavingQuote(false);
      setMsg("Sign in first.");
      return;
    }

    const res = await fetch("/api/admin/custom-food-requests/quote", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        requestId: request.id,
        quotedTotal: q,
      }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      setSavingQuote(false);
      setMsg(body?.error ?? "Failed to send quote.");
      return;
    }

    setOrderStatus("pending_payment");
    setOrderNotes((prev) => {
      const next = parseErrandQuote(prev);
      const base = prev ?? "";
      const markerClean = base
        .replace(/\[ERRAND_QUOTE_STATUS=[^\]]+\]/g, "")
        .replace(/\[ERRAND_QUOTE_TOTAL=[^\]]+\]/g, "")
        .trim();
      const marker = `[ERRAND_QUOTE_STATUS=quoted] [ERRAND_QUOTE_TOTAL=${Math.round(q)}]`;
      if (!next.isErrand) return `${markerClean} [ERRAND=1] ${marker}`.trim();
      return `${markerClean} ${marker}`.trim();
    });
    setSavingQuote(false);
    setMsg("Quote sent. Customer can now approve and continue payment.");
  }

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
            <div className="mt-3">
              <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${quoteStatusChip(quoteStatus)}`}>
                {quoteStatusLabel(quoteStatus)}
              </span>
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

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Quote workflow</p>
            <p className="mt-1 text-xs text-gray-600">Order status: {orderStatus ?? "pending_payment"}</p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className={`rounded-xl border px-3 py-2 text-center text-xs font-medium ${stepStyle(isPending, true)}`}>Request received</div>
              <div className={`rounded-xl border px-3 py-2 text-center text-xs font-medium ${stepStyle(isQuoted, isQuoted || isApproved)}`}>Quote sent</div>
              <div className={`rounded-xl border px-3 py-2 text-center text-xs font-medium ${stepStyle(isApproved, isApproved)}`}>Customer approved</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border bg-gray-50 p-3">
                <p className="text-xs text-gray-600">Current quote total</p>
                <p className="mt-1 text-base font-semibold">{naira(quotedValue)}</p>
              </div>
              <div className="rounded-xl border bg-gray-50 p-3">
                <p className="text-xs text-gray-600">State</p>
                <p className="mt-1 text-base font-semibold">{quoteStatusLabel(quoteStatus)}</p>
              </div>
            </div>

            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-600">Update quoted grand total (with delivery)</label>
                <input
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                  inputMode="numeric"
                  type="number"
                  value={quotedTotal}
                  onChange={(e) => setQuotedTotal(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                onClick={saveQuote}
                disabled={savingQuote}
              >
                {savingQuote ? "Sending..." : "Send quote"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
