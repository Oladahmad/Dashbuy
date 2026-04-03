"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function clean(s: string) {
  return s.trim();
}

export default function AccountWithdrawPage() {
  const router = useRouter();
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const canSubmit = useMemo(() => {
    const amt = Number(amount);
    return (
      clean(bankName).length > 1 &&
      clean(accountName).length > 1 &&
      clean(accountNumber).length >= 10 &&
      Number.isFinite(amt) &&
      amt > 0
    );
  }, [bankName, accountName, accountNumber, amount]);

  async function submit() {
    setMsg("");
    if (!canSubmit) {
      setMsg("Please fill all fields correctly.");
      return;
    }
    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    const res = await fetch("/api/customer/withdraw-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        bankName: clean(bankName),
        accountNumber: clean(accountNumber),
        accountName: clean(accountName),
        amount: Number(amount),
        note: clean(note),
      }),
    });

    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string } | null;
    if (!res.ok || !body?.ok) {
      setSaving(false);
      setMsg(body?.error ?? "Withdrawal request failed.");
      return;
    }

    setSaving(false);
    setMsg(body.message ?? "Withdrawal request sent.");
    setTimeout(() => router.push("/account"), 1000);
  }

  return (
    <AppShell title="Withdraw funds">
      <div className="rounded-2xl border bg-white p-5">
        <p className="text-sm text-gray-600">Rejected order funds</p>
        <p className="text-base font-semibold">Request withdrawal</p>
        <p className="mt-1 text-sm text-gray-600">
          Submit your bank details and amount. We will process and notify you.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-5 space-y-3">
        <div>
          <label className="text-sm font-medium">Bank name</label>
          <input
            className="mt-1 w-full rounded-xl border p-3"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. Access Bank"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Account number</label>
          <input
            className="mt-1 w-full rounded-xl border p-3"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            inputMode="numeric"
            placeholder="10-digit account number"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Account name</label>
          <input
            className="mt-1 w-full rounded-xl border p-3"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Name on account"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Amount</label>
          <input
            className="mt-1 w-full rounded-xl border p-3"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 5000"
          />
          <p className="mt-1 text-xs text-gray-500">{naira(Number(amount || 0))}</p>
        </div>
        <div>
          <label className="text-sm font-medium">Note (optional)</label>
          <textarea
            className="mt-1 w-full rounded-xl border p-3"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Any extra note"
          />
        </div>

        {msg ? <p className="text-sm text-orange-600">{msg}</p> : null}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="rounded-xl border px-4 py-3" onClick={() => router.push("/account")} disabled={saving}>
            Back
          </button>
          <button
            type="button"
            className="rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
            onClick={submit}
            disabled={!canSubmit || saving}
          >
            {saving ? "Submitting..." : "Withdraw"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
