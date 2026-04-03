"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function VendorEmergencyWithdrawPage() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submitRequest() {
    setBusy(true);
    setMsg(null);
    setErr(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setErr("Not signed in.");
      setBusy(false);
      return;
    }

    const res = await fetch("/api/payouts/emergency-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: Math.floor(Number(amount)),
        note,
      }),
    });

    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string } | null;
    if (!res.ok || !body?.ok) {
      setErr(body?.error ?? "Could not submit emergency request.");
      setBusy(false);
      return;
    }

    setMsg(body.message ?? "Request sent successfully.");
    setAmount("");
    setNote("");
    setBusy(false);
  }

  return (
    <main className="p-4 max-w-xl mx-auto space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-600">Vendor withdrawal</p>
          <p className="text-base font-semibold">Emergency withdrawal</p>
        </div>
        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm"
          onClick={() => router.push("/vendor/withdraw")}
        >
          Back
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <p className="text-sm text-gray-700">Your withdrawal will be processed and sent within 2 hours max.</p>

        <div>
          <label className="text-sm text-gray-700">Amount (NGN)</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-3"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Enter amount"
          />
        </div>

        <div>
          <label className="text-sm text-gray-700">Note (optional)</label>
          <textarea
            className="mt-1 w-full rounded-xl border px-3 py-3"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any extra note"
          />
        </div>

        <button
          type="button"
          className="w-full rounded-xl bg-black px-4 py-3 text-sm text-white disabled:opacity-60"
          disabled={busy || Math.floor(Number(amount)) <= 0}
          onClick={submitRequest}
        >
          {busy ? "Submitting..." : "Withdraw"}
        </button>

        {msg ? <p className="text-sm text-green-700">{msg}</p> : null}
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
      </div>
    </main>
  );
}
