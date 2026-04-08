"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Metrics = {
  usersCount: number;
  vendorProductsCount: number;
  vendorFoodCount: number;
};

type MismatchOrderRow = {
  id: string;
  amount: number | null;
  last_paid_amount: number | null;
  created_at: string | null;
  paid_at: string | null;
  order_ids?: string[] | null;
};

type MismatchWalletRow = {
  id: string;
  amount: number | null;
  last_paid_amount: number | null;
  created_at: string | null;
  paid_at: string | null;
};

type ManualOrderItem = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  status: string | null;
  total: number;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  order_name: string;
  items_text: string;
  created_at: string;
};

type PayoutPreview = {
  id: string;
  vendor_name: string;
  amount: number;
  status: string | null;
  created_at: string;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function friendlyStatus(status: string | null) {
  return String(status ?? "").replace(/_/g, " ").trim() || "pending vendor";
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [mismatchMsg, setMismatchMsg] = useState("");
  const [mismatchBusy, setMismatchBusy] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    usersCount: 0,
    vendorProductsCount: 0,
    vendorFoodCount: 0,
  });
  const [orderMismatches, setOrderMismatches] = useState<MismatchOrderRow[]>([]);
  const [walletMismatches, setWalletMismatches] = useState<MismatchWalletRow[]>([]);
  const [manualOrders, setManualOrders] = useState<ManualOrderItem[]>([]);
  const [payouts, setPayouts] = useState<PayoutPreview[]>([]);

  async function loadMismatches(token: string) {
    const mismatchRes = await fetch("/api/admin/dva-mismatches", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mismatchBody = (await mismatchRes.json().catch(() => null)) as
      | {
          ok?: boolean;
          error?: string;
          mismatches?: { orders?: MismatchOrderRow[]; wallets?: MismatchWalletRow[] };
        }
      | null;
    if (!mismatchRes.ok || !mismatchBody?.ok) {
      setMismatchMsg(mismatchBody?.error ?? "Unable to load payment mismatches.");
      return;
    }
    setOrderMismatches(mismatchBody.mismatches?.orders ?? []);
    setWalletMismatches(mismatchBody.mismatches?.wallets ?? []);
  }

  async function resolveMismatch(kind: "order" | "wallet", id: string, action: "mark_paid" | "credit_wallet" | "ignore") {
    setMismatchMsg("");
    setMismatchBusy(`${kind}:${id}:${action}`);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMismatchMsg("Session expired. Please log in again.");
      setMismatchBusy(null);
      return;
    }
    const res = await fetch("/api/admin/dva-mismatches/resolve", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id, action }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      setMismatchMsg(body?.error ?? "Unable to resolve mismatch.");
      setMismatchBusy(null);
      return;
    }
    await loadMismatches(token);
    setMismatchBusy(null);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setMsg("");
      setMismatchMsg("");

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
      const manualRes = await fetch("/api/admin/manual-orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const manualBody = (await manualRes.json().catch(() => null)) as
        | { ok?: boolean; error?: string; items?: ManualOrderItem[] }
        | null;
      if (manualRes.ok && manualBody?.ok) {
        setManualOrders(manualBody.items ?? []);
      }
      const payoutsRes = await fetch("/api/admin/payouts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payoutsBody = (await payoutsRes.json().catch(() => null)) as
        | { ok?: boolean; items?: PayoutPreview[] }
        | null;
      if (payoutsRes.ok && payoutsBody?.ok) {
        setPayouts(payoutsBody.items ?? []);
      }
      setLoading(false);
      if (!alive) return;
      await loadMismatches(token);
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
            <p className="text-xs uppercase tracking-wide text-gray-500">Customer users</p>
            <p className="mt-2 text-4xl font-bold text-black">{metrics.usersCount.toLocaleString()}</p>
            <p className="mt-1 text-xs text-gray-500">All registered accounts including vendors</p>
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold">Payment mismatches</p>
            <p className="text-sm text-gray-600">
              Dedicated account payments that did not match the expected amount.
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>Orders: {orderMismatches.length}</div>
            <div>Wallet topups: {walletMismatches.length}</div>
          </div>
        </div>

        {mismatchMsg ? <div className="mt-3 rounded-xl border p-3 text-sm text-red-600">{mismatchMsg}</div> : null}

        {!mismatchMsg && orderMismatches.length === 0 && walletMismatches.length === 0 ? (
          <div className="mt-3 rounded-xl border p-3 text-sm text-gray-600">No mismatched payments yet.</div>
        ) : null}

        {orderMismatches.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order payments</p>
            <div className="grid gap-2">
              {orderMismatches.map((row) => (
                <div key={row.id} className="rounded-xl border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Order DVA</span>
                    <span className="text-xs text-gray-500">{new Date(row.created_at ?? "").toLocaleString()}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Expected: ₦{Math.round(Number(row.amount ?? 0)).toLocaleString()}</span>
                    <span>Paid: ₦{Math.round(Number(row.last_paid_amount ?? 0)).toLocaleString()}</span>
                  </div>
                  {Array.isArray(row.order_ids) && row.order_ids.length > 0 ? (
                    <p className="mt-1 text-xs text-gray-500">{row.order_ids.length} linked orders</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {walletMismatches.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Wallet topups</p>
            <div className="grid gap-2">
              {walletMismatches.map((row) => (
                <div key={row.id} className="rounded-xl border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Wallet DVA</span>
                    <span className="text-xs text-gray-500">{new Date(row.created_at ?? "").toLocaleString()}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Expected: ₦{Math.round(Number(row.amount ?? 0)).toLocaleString()}</span>
                    <span>Paid: ₦{Math.round(Number(row.last_paid_amount ?? 0)).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Vendor payouts</p>
            <p className="mt-1 text-sm text-gray-600">Recent automatic and manual payout records.</p>
          </div>
          <Link href="/admin/payouts" className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
            View all
          </Link>
        </div>

        {payouts.length === 0 ? (
          <div className="mt-3 rounded-xl border p-3 text-sm text-gray-600">No payout records yet.</div>
        ) : (
          <div className="mt-3 grid gap-2">
            {payouts.slice(0, 5).map((row) => (
              <div key={row.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{row.vendor_name}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      {new Date(row.created_at).toLocaleString()} · {String(row.status ?? "").replace(/_/g, " ") || "recorded"}
                    </p>
                  </div>
                  <p className="font-semibold">{naira(row.amount)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Vendor manual orders</p>
            <p className="mt-1 text-sm text-gray-600">All manual orders created by vendors across Dashbuy.</p>
          </div>
          <Link href="/admin/manual-orders" className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50">
            View all
          </Link>
        </div>

        {manualOrders.length === 0 ? (
          <div className="mt-3 rounded-xl border p-3 text-sm text-gray-600">No vendor manual orders yet.</div>
        ) : (
          <div className="mt-3 grid gap-2">
            {manualOrders.slice(0, 5).map((item) => (
              <Link key={item.id} href={`/admin/manual-orders/${item.id}`} className="block rounded-xl border p-3 hover:bg-gray-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{item.order_name}</p>
                    <p className="mt-1 text-xs text-gray-600">{item.customer_name} · {item.vendor_name}</p>
                  </div>
                  <p className="font-semibold">{naira(item.total)}</p>
                </div>
                <p className="mt-1 text-xs text-gray-500">{friendlyStatus(item.status)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <p className="font-semibold">Operations</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link href="/admin/custom-food-requests" className="rounded-xl border px-4 py-3 text-center font-medium hover:bg-gray-50">
            View custom food requests
          </Link>
          <Link href="/admin/payouts" className="rounded-xl border px-4 py-3 text-center font-medium hover:bg-gray-50">
            View vendor payouts
          </Link>
          <Link href="/admin/notifications" className="rounded-xl border px-4 py-3 text-center font-medium hover:bg-gray-50">
            Send push notifications
          </Link>
          <Link href="/admin/manual-orders" className="rounded-xl border px-4 py-3 text-center font-medium hover:bg-gray-50">
            View vendor manual orders
          </Link>
        </div>
      </div>
    </div>
  );
}
