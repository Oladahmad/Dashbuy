"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type PayoutRow = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  order_id: string | null;
  amount: number;
  reference: string | null;
  created_at: string;
  status: string | null;
  type: string | null;
  bank_name: string | null;
  bank_code: string | null;
  account_number: string | null;
  account_name: string | null;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function niceStatus(status: string | null) {
  return String(status ?? "").replace(/_/g, " ").trim() || "recorded";
}

export default function AdminPayoutsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [filter, setFilter] = useState<"all" | "initiated" | "successful" | "failed" | "reversed">("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setErr("Not signed in.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/admin/payouts", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; items?: PayoutRow[] }
        | null;
      if (!res.ok || !body?.ok || !Array.isArray(body.items)) {
        setErr(body?.error ?? "Could not load payouts.");
        setLoading(false);
        return;
      }

      setRows(body.items);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) => String(row.status ?? "").toLowerCase() === filter);
  }, [filter, rows]);

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="rounded-2xl border bg-white p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">Admin</p>
          <p className="text-base font-semibold">Vendor payouts</p>
        </div>
        <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/admin")}>
          Back
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(["all", "initiated", "successful", "failed", "reversed"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`rounded-xl border px-4 py-3 text-sm ${filter === key ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setFilter(key)}
          >
            {key === "all" ? "All" : key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading payouts...</div> : null}
      {err ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{err}</div> : null}

      {!loading && !err ? (
        <div className="rounded-2xl border bg-white p-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-600">No payout records yet.</p>
          ) : (
            <div className="grid gap-2">
              {filtered.map((row) => (
                <div key={row.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{row.vendor_name}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        {row.order_id ? `Order ${row.order_id.slice(0, 8)}` : "No order linked"} · {fmtDate(row.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{naira(row.amount)}</p>
                      <p className="mt-1 text-xs text-gray-600">{niceStatus(row.status)}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
                    <p>Type: {row.type ?? "-"}</p>
                    <p>Bank: {row.bank_name ?? "-"}</p>
                    <p>Bank code: {row.bank_code ?? "-"}</p>
                    <p>Account: {row.account_number ?? "-"}</p>
                    <p>Account name: {row.account_name ?? "-"}</p>
                    <p>Ref: {row.reference ?? "-"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
