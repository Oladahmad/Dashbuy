"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

type WalletHistoryItem = {
  id: string;
  amount: number | null;
  reference: string;
  provider: string | null;
  type: string | null;
  status: string | null;
  created_at: string;
  source?: string;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fmtDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function filterLabel(filter: string) {
  if (filter === "bank_funding") return "Bank funding";
  if (filter === "rejected") return "Rejected orders";
  if (filter === "spent") return "Wallet spending";
  if (filter === "withdrawal") return "Withdrawal requests";
  return "All";
}

function itemTitle(item: WalletHistoryItem) {
  if (item.type === "rejected_refund") return "Rejected order refund";
  if (item.type === "topup") return "Bank funding";
  if (item.type === "payment") return "Wallet payment";
  if (item.type === "withdrawal_request") return "Withdrawal request";
  return "Wallet transaction";
}

function amountText(item: WalletHistoryItem) {
  const amount = naira(Number(item.amount ?? 0));
  if (item.type === "payment" || item.type === "withdrawal_request") return `-${amount}`;
  return `+${amount}`;
}

function WalletHistoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState<WalletHistoryItem[]>([]);

  const filter = useMemo(() => {
    const value = String(searchParams.get("filter") ?? "all").trim().toLowerCase();
    if (value === "bank_funding") return value;
    if (value === "rejected") return value;
    if (value === "spent") return value;
    if (value === "withdrawal") return value;
    return "all";
  }, [searchParams]);

  const balance = useMemo(() => {
    return items.reduce((sum, item) => {
      const amount = Number(item.amount ?? 0);
      if (item.type === "payment" || item.type === "withdrawal_request") return sum - amount;
      return sum + amount;
    }, 0);
  }, [items]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      if (!token) {
        router.replace("/auth/login?next=%2Faccount%2Fwallet-history");
        return;
      }

      const res = await fetch(`/api/wallet/history?filter=${encodeURIComponent(filter)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; items?: WalletHistoryItem[] } | null;
      if (!res.ok || !body?.ok) {
        setMsg(body?.error ?? "Unable to load wallet history.");
        setItems([]);
        setLoading(false);
        return;
      }

      setItems(body.items ?? []);
      setLoading(false);
    })();
  }, [filter, router]);

  function setFilter(next: "all" | "bank_funding" | "rejected" | "spent" | "withdrawal") {
    router.push(`/account/wallet-history?filter=${next}`);
  }

  return (
    <AppShell title="Wallet history">
      <div className="rounded-3xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Wallet history</p>
            <p className="mt-1 text-sm text-gray-600">Track money added by payment and money returned from rejected orders.</p>
          </div>
          <button className="rounded-full border px-4 py-2 text-sm font-medium" type="button" onClick={() => router.push("/account")}>
            Back
          </button>
        </div>

        <div className="mt-4">
          <div className="rounded-2xl border bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Current balance</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{naira(balance)}</p>
          </div>

          <label className="text-xs font-medium uppercase tracking-[0.14em] text-gray-500">Filter</label>
          <select
            className="mt-3 w-full rounded-2xl border bg-white px-4 py-3 text-sm font-medium"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "bank_funding" | "rejected" | "spent" | "withdrawal")}
          >
            <option value="all">All activity</option>
            <option value="bank_funding">Bank funding</option>
            <option value="rejected">Rejected orders</option>
            <option value="spent">Wallet spending</option>
            <option value="withdrawal">Withdrawal requests</option>
          </select>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-gray-500">Showing: {filterLabel(filter)}</p>

        {loading ? <p className="mt-4 text-sm text-gray-600">Loading wallet history...</p> : null}
        {!loading && msg ? <p className="mt-4 text-sm text-orange-600">{msg}</p> : null}
        {!loading && !msg && items.length === 0 ? <p className="mt-4 text-sm text-gray-600">No history found for this filter.</p> : null}

        {!loading && !msg && items.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => router.push(`/account/wallet-history/${item.id}`)}
                className="rounded-2xl border p-4 text-left transition hover:bg-gray-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{itemTitle(item)}</p>
                    <p className="mt-1 text-sm text-gray-600">{fmtDate(item.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${item.type === "payment" || item.type === "withdrawal_request" ? "text-red-600" : "text-emerald-700"}`}>
                      {amountText(item)}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-500">{String(item.status ?? "").replace(/_/g, " ")}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                  <span>
                    {item.type === "topup"
                      ? "Payment gateway"
                      : item.type === "rejected_refund"
                        ? "Wallet refund"
                        : item.type === "payment"
                          ? "Order payment"
                          : item.type === "withdrawal_request"
                            ? "Withdrawal"
                            : "Wallet activity"}
                  </span>
                  <span className="truncate">{item.reference}</span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

export default function WalletHistoryPage() {
  return (
    <Suspense fallback={<AppShell title="Wallet history"><div className="rounded-2xl border bg-white p-5 text-sm text-gray-600">Loading wallet history...</div></AppShell>}>
      <WalletHistoryPageContent />
    </Suspense>
  );
}
