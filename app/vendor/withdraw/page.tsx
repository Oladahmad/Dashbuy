"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Summary = {
  role: string;
  earned: number;
  paid: number;
  withdrawable: number;
};

type ProfileLite = {
  id: string;
  role: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function clean(v: string | null | undefined) {
  return String(v ?? "").trim();
}

export default function VendorWithdrawPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingBank, setSavingBank] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [editingBank, setEditingBank] = useState(false);

  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [dailyAutoOn, setDailyAutoOn] = useState(true);

  const bankMissing = useMemo(
    () => !clean(bankName) || !clean(bankAccountNumber) || !clean(bankAccountName),
    [bankName, bankAccountNumber, bankAccountName]
  );

  async function loadAll() {
    setLoading(true);
    setErr(null);
    setMsg(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const user = sessionData.session?.user;
    if (!token || !user) {
      setErr("Not signed in.");
      setLoading(false);
      return;
    }

    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("id,role,bank_name,bank_account_number,bank_account_name")
      .eq("id", user.id)
      .maybeSingle<ProfileLite>();

    if (pErr || !prof) {
      setErr(pErr?.message ?? "Profile not found.");
      setLoading(false);
      return;
    }
    if (!["vendor_food", "vendor_products", "admin"].includes(String(prof.role ?? ""))) {
      setErr("You do not have access to vendor withdrawal.");
      setLoading(false);
      return;
    }

    setProfile(prof);
    setBankName(prof.bank_name ?? "");
    setBankAccountNumber(prof.bank_account_number ?? "");
    setBankAccountName(prof.bank_account_name ?? "");

    const summaryRes = await fetch("/api/payouts/summary", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const summaryBody = (await summaryRes.json().catch(() => null)) as
      | { ok?: boolean; error?: string; earned?: number; paid?: number; withdrawable?: number; role?: string }
      | null;

    if (!summaryRes.ok || !summaryBody?.ok) {
      setErr(summaryBody?.error ?? "Failed to load payout summary.");
      setLoading(false);
      return;
    }

    setSummary({
      role: String(summaryBody.role ?? ""),
      earned: Number(summaryBody.earned ?? 0),
      paid: Number(summaryBody.paid ?? 0),
      withdrawable: Number(summaryBody.withdrawable ?? 0),
    });
    setLoading(false);
  }

  async function saveBankDetails() {
    if (!profile) return;
    const bn = clean(bankName);
    const bac = clean(bankAccountNumber);
    const ban = clean(bankAccountName);

    if (!bn) return setErr("Bank name is required.");
    if (!bac || bac.length < 10) return setErr("Enter a valid account number.");
    if (!ban) return setErr("Account name is required.");

    setSavingBank(true);
    setErr(null);
    setMsg(null);

    const { error } = await supabase
      .from("profiles")
      .update({
        bank_name: bn,
        bank_account_number: bac,
        bank_account_name: ban,
      })
      .eq("id", profile.id);

    setSavingBank(false);
    if (error) return setErr(error.message);

    setProfile({
      ...profile,
      bank_name: bn,
      bank_account_number: bac,
      bank_account_name: ban,
    });
    setEditingBank(false);
    setMsg("Bank details saved.");
  }

  useEffect(() => {
    const stored = localStorage.getItem("dashbuy_vendor_daily_auto_withdraw");
    if (stored === "off") setDailyAutoOn(false);
    loadAll();
  }, []);

  useEffect(() => {
    localStorage.setItem("dashbuy_vendor_daily_auto_withdraw", dailyAutoOn ? "on" : "off");
  }, [dailyAutoOn]);

  return (
    <main className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">Vendor withdrawal</p>
          <p className="text-base font-semibold">Withdrawal center</p>
        </div>
        <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => router.push("/vendor/account")}>
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
              <p className="text-xs text-gray-600">Withdrawn</p>
              <p className="mt-1 text-lg font-semibold">{naira(summary.paid)}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-gray-600">Available</p>
              <p className="mt-1 text-lg font-semibold">{naira(summary.withdrawable)}</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Daily automatic withdrawal</p>
                <p className="text-sm text-gray-600">All daily earnings will be sent by 11:00PM every day.</p>
              </div>
              <button
                type="button"
                aria-pressed={dailyAutoOn}
                onClick={() => setDailyAutoOn((v) => !v)}
                className={`relative h-8 w-14 rounded-full border transition ${dailyAutoOn ? "bg-black" : "bg-gray-200"}`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${dailyAutoOn ? "left-7" : "left-1"}`}
                />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {dailyAutoOn ? "Daily automatic withdrawal is ON for this account session." : "Daily automatic withdrawal is OFF."}
            </p>

            {bankMissing ? (
              <p className="text-sm text-red-600 font-medium">
                Enter your account details for daily withdrawal or emergency withdrawal.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Account details</p>
              {!editingBank ? (
                <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" onClick={() => setEditingBank(true)}>
                  Edit
                </button>
              ) : null}
            </div>

            {!editingBank ? (
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-600">Bank:</span> {profile?.bank_name || "Not set"}</p>
                <p><span className="text-gray-600">Account number:</span> {profile?.bank_account_number || "Not set"}</p>
                <p><span className="text-gray-600">Account name:</span> {profile?.bank_account_name || "Not set"}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-700">Bank name</label>
                  <input className="mt-1 w-full rounded-xl border px-3 py-3" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm text-gray-700">Account number</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-3"
                    value={bankAccountNumber}
                    onChange={(e) => setBankAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-700">Account name</label>
                  <input className="mt-1 w-full rounded-xl border px-3 py-3" value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-xl border px-4 py-3 text-sm"
                    disabled={savingBank}
                    onClick={() => {
                      setEditingBank(false);
                      setBankName(profile?.bank_name ?? "");
                      setBankAccountNumber(profile?.bank_account_number ?? "");
                      setBankAccountName(profile?.bank_account_name ?? "");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-black px-4 py-3 text-sm text-white disabled:opacity-60"
                    disabled={savingBank || bankMissing}
                    onClick={saveBankDetails}
                  >
                    {savingBank ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-4 grid gap-2">
            <button
              type="button"
              className="w-full rounded-xl border px-4 py-3 text-sm hover:bg-gray-50"
              onClick={() => router.push("/vendor/withdraw/emergency")}
            >
              Emergency withdrawal
            </button>
            <button
              type="button"
              className="w-full rounded-xl border px-4 py-3 text-sm hover:bg-gray-50"
              onClick={() => router.push("/vendor/withdraw/history")}
            >
              Payout history
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
}

