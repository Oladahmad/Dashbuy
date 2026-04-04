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
        <p className="font-semibold">Operations</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Link href="/admin/custom-food-requests" className="rounded-xl border px-4 py-3 text-center font-medium hover:bg-gray-50">
            View custom food requests
          </Link>
          <Link href="/admin/notifications" className="rounded-xl border px-4 py-3 text-center font-medium hover:bg-gray-50">
            Send push notifications
          </Link>
        </div>
      </div>
    </div>
  );
}
