"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Bank = {
  name: string;
  code: string;
};

type Payout = {
  id: string;
  amount: number;
  created_at: string;
  reference: string | null;
};

type Summary = {
  role: string;
  earned: number;
  paid: number;
  withdrawable: number;
  payouts: Payout[];
};

type ProfileLite = {
  role: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
};

function naira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function LogisticsWithdrawPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);

  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [amount, setAmount] = useState("");

  const withdrawable = useMemo(() => Math.floor(summary?.withdrawable ?? 0), [summary]);

  const canSubmit = useMemo(() => {
    const n = Math.floor(Number(amount));
    if (!bankCode || !bankName || !accountNumber || !accountName) return false;
    if (!Number.isFinite(n) || n <= 0) return false;
    if (n > withdrawable) return false;
    return true;
  }, [amount, bankCode, bankName, accountNumber, accountName, withdrawable]);

  async function authToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Not signed in");
    return data.session.access_token;
  }

  async function loadAll() {
    setLoading(true);
    setErr(null);
    setMsg(null);

    try {
      const token = await authToken();

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("role,bank_name,bank_account_number,bank_account_name")
        .maybeSingle<ProfileLite>();

      if (pErr) throw new Error(pErr.message);
      const role = String(prof?.role ?? "");
      if (!["logistics", "admin"].includes(role)) {
        throw new Error("You do not have access to logistics withdrawal");
      }

      const [summaryRes, banksRes] = await Promise.all([
        fetch("/api/payouts/summary", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/payouts/banks", { cache: "no-store" }),
      ]);

      const summaryBody = (await summaryRes.json()) as { ok?: boolean; error?: string } & Summary;
      if (!summaryRes.ok || !summaryBody.ok) throw new Error(summaryBody.error ?? "Failed to load payout summary");

      const banksBody = (await banksRes.json()) as { ok?: boolean; error?: string; banks?: Bank[] };
      if (!banksRes.ok || !banksBody.ok) throw new Error(banksBody.error ?? "Failed to load banks");

      setSummary(summaryBody);
      setBanks(Array.isArray(banksBody.banks) ? banksBody.banks : []);

      if (prof?.bank_account_number) setAccountNumber(prof.bank_account_number);
      if (prof?.bank_account_name) setAccountName(prof.bank_account_name);

      if (prof?.bank_name) {
        const existing = (banksBody.banks ?? []).find((b) => b.name.toLowerCase() === prof.bank_name?.toLowerCase());
        if (existing) {
          setBankName(existing.name);
          setBankCode(existing.code);
        }
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load withdrawal page");
    } finally {
      setLoading(false);
    }
  }

  async function resolveAccountName() {
    setErr(null);
    setMsg(null);
    if (!bankCode || accountNumber.trim().length !== 10) return;
    setBusy(true);
    try {
      const res = await fetch("/api/payouts/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankCode, accountNumber: accountNumber.trim() }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; accountName?: string };
      if (!res.ok || !body.ok || !body.accountName) throw new Error(body.error ?? "Resolve failed");
      setAccountName(body.accountName);
      setMsg("Account name resolved.");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not resolve account name");
    } finally {
      setBusy(false);
    }
  }

  async function submitWithdraw() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const token = await authToken();
      const res = await fetch("/api/payouts/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: Math.floor(Number(amount)),
          bankCode,
          bankName,
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Withdrawal failed");

      setMsg(body.message ?? "Withdrawal successful.");
      setAmount("");
      await loadAll();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Withdrawal failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <main className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">Logistics withdrawal</p>
          <p className="text-base font-semibold">Withdraw your delivery earnings</p>
        </div>
        <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/logistics")}>
          Back
        </button>
      </div>

      {loading ? <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading...</div> : null}
      {err ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{err}</div> : null}
      {msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-green-700">{msg}</div> : null}

      {!loading && summary ? (
        <>
          <div className="rounded-2xl border bg-white p-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Total earned</p>
              <p className="mt-1 text-lg font-semibold">{naira(summary.earned)}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Already paid</p>
              <p className="mt-1 text-lg font-semibold">{naira(summary.paid)}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Withdrawable</p>
              <p className="mt-1 text-lg font-semibold">{naira(summary.withdrawable)}</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 space-y-3">
            <p className="font-semibold">Bank details and amount</p>

            <div>
              <label className="text-sm text-gray-700">Bank</label>
              <select
                className="mt-1 w-full rounded-xl border px-3 py-3"
                value={bankCode}
                onChange={(e) => {
                  const code = e.target.value;
                  const b = banks.find((x) => x.code === code);
                  setBankCode(code);
                  setBankName(b?.name ?? "");
                }}
                disabled={busy}
              >
                <option value="">Select bank</option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-gray-700">Account number</label>
              <div className="mt-1 flex gap-2">
                <input
                  className="w-full rounded-xl border px-3 py-3"
                  placeholder="10-digit account number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  inputMode="numeric"
                  disabled={busy}
                />
                <button type="button" className="rounded-xl border px-4 py-3 text-sm" onClick={resolveAccountName} disabled={busy}>
                  Resolve
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-700">Account name</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Account name"
                disabled={busy}
              />
            </div>

            <div>
              <label className="text-sm text-gray-700">Amount (NGN)</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                placeholder={`Max ${withdrawable}`}
                inputMode="numeric"
                disabled={busy}
              />
            </div>

            <button
              type="button"
              className="w-full rounded-xl bg-black text-white px-4 py-3 text-sm disabled:opacity-60"
              disabled={!canSubmit || busy}
              onClick={submitWithdraw}
            >
              {busy ? "Processing..." : "Withdraw now"}
            </button>
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <p className="font-semibold">Recent withdrawals</p>
            <div className="mt-3 grid gap-2">
              {summary.payouts.length === 0 ? (
                <p className="text-sm text-gray-600">No withdrawals yet.</p>
              ) : (
                summary.payouts.map((p) => (
                  <div key={p.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-sm">{naira(p.amount)}</p>
                      <p className="text-xs text-gray-600">{fmtDate(p.created_at)}</p>
                    </div>
                    {p.reference ? <p className="mt-1 text-xs text-gray-600">Ref: {p.reference}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
