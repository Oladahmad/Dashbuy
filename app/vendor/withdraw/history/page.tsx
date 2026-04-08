"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Payout = {
  id: string;
  amount: number;
  created_at: string;
  reference: string | null;
  order_id?: string | null;
  status?: string | null;
  type?: string | null;
  bank_name?: string | null;
  bank_code?: string | null;
  account_number?: string | null;
  squad_transfer_reference?: string | null;
  squad_requery_status?: string | null;
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

function emergencyAmount(reference: string | null) {
  const ref = String(reference ?? "");
  const m = ref.match(/emergency_request_[^_]+_\d+_(\d+)$/i);
  if (!m) return 0;
  return Number(m[1] ?? 0);
}

function statusLabel(row: Payout) {
  const type = String(row.type ?? "").toLowerCase();
  const status = String(row.status ?? "").toLowerCase();
  if (type === "emergency_request") return "Request sent";
  if (status === "successful") return "Successful";
  if (status === "failed") return "Failed";
  if (status === "reversed") return "Reversed";
  if (status === "initiated") return "Initiated";
  if (row.squad_requery_status) return row.squad_requery_status;
  return "Recorded";
}

export default function VendorWithdrawHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Payout[]>([]);

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

      const res = await fetch("/api/payouts/summary", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; payouts?: Payout[] }
        | null;

      if (!res.ok || !body?.ok || !Array.isArray(body.payouts)) {
        setErr(body?.error ?? "Could not load payout history.");
        setLoading(false);
        return;
      }

      setRows(body.payouts);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">Vendor withdrawal</p>
          <p className="text-base font-semibold">Payout history</p>
        </div>
        <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/vendor/withdraw")}>
          Back
        </button>
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading history...</div> : null}
      {err ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{err}</div> : null}

      {!loading && !err ? (
        <div className="rounded-2xl border bg-white p-4">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-600">No payout history yet.</p>
          ) : (
            <div className="grid gap-2">
              {rows.map((p) => {
                const isEmergency =
                  String(p.type ?? "").toLowerCase() === "emergency_request" ||
                  String(p.reference ?? "").startsWith("emergency_request_");
                const reqAmount = emergencyAmount(p.reference);
                return (
                  <div key={p.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {isEmergency ? `Emergency request ${reqAmount > 0 ? `(${naira(reqAmount)})` : ""}` : naira(p.amount)}
                      </p>
                      <p className="text-xs text-gray-600">{fmtDate(p.created_at)}</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">Status: {statusLabel(p)}</p>
                    {p.order_id ? <p className="mt-1 text-xs text-gray-600">Order: {p.order_id.slice(0, 8)}</p> : null}
                    {p.bank_name ? <p className="mt-1 text-xs text-gray-600">Bank: {p.bank_name}</p> : null}
                    {p.account_number ? <p className="mt-1 text-xs text-gray-600">Account: {p.account_number}</p> : null}
                    {p.squad_transfer_reference ? (
                      <p className="mt-1 text-xs text-gray-600">Squad ref: {p.squad_transfer_reference}</p>
                    ) : null}
                    {p.reference ? <p className="mt-1 text-xs text-gray-600">Ref: {p.reference}</p> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}
