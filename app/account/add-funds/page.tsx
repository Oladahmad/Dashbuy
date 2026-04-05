"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

export default function AddFundsPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceErr, setBalanceErr] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (user?.email) setEmail(user.email);

      const token = data.session?.access_token ?? "";
      if (!token) return;

      const balRes = await fetch("/api/wallet/balance", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const balBody = (await balRes.json().catch(() => null)) as { ok?: boolean; balance?: number } | null;
      if (balRes.ok && balBody?.ok) {
        setBalance(Number(balBody.balance ?? 0));
        setBalanceErr("");
      } else {
        setBalanceErr("Unable to load wallet balance.");
      }
    })();
  }, []);

  const canPay = useMemo(() => {
    const amt = Number(amount);
    return email.trim().length > 3 && Number.isFinite(amt) && amt > 0;
  }, [email, amount]);

  async function startPayment() {
    setMsg("");
    if (!canPay || loading) return;
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const token = session?.access_token ?? "";
    if (!token) {
      setLoading(false);
      setMsg("Please sign in again to continue.");
      router.push("/auth/login");
      return;
    }

    const res = await fetch("/api/wallet/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount: Number(amount),
        email,
      }),
    });

    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; authorization_url?: string }
      | null;

    if (!res.ok || !body?.ok || !body.authorization_url) {
      setLoading(false);
      setMsg(body?.error ?? "Unable to start wallet funding.");
      return;
    }

    setCheckoutUrl(body.authorization_url);
    setMsg("Redirecting to payment gateway...");
    window.location.href = body.authorization_url;
  }

  return (
    <AppShell title="Add funds">
      <div className="rounded-2xl border bg-white p-5">
        <p className="text-sm text-gray-600">Wallet top up</p>
        <p className="text-base font-semibold">Add funds to your Dashbuy wallet</p>
        <p className="mt-1 text-sm text-gray-600">Fund your wallet using the payment gateway.</p>
        <div className="mt-3 rounded-xl border bg-gray-50 p-3">
          <p className="text-xs text-gray-600">Current wallet balance</p>
          <p className="mt-1 text-lg font-semibold">{balance == null ? "Loading..." : naira(balance)}</p>
          {balanceErr ? <p className="mt-1 text-xs text-red-600">{balanceErr}</p> : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-5 space-y-3">
        <div>
          <label className="text-sm font-medium">Email</label>
          <input
            className="mt-1 w-full rounded-xl border p-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
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

        {msg ? <p className="text-sm text-orange-600">{msg}</p> : null}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="rounded-xl border px-4 py-3" onClick={() => router.push("/account")} disabled={loading}>
            Back
          </button>
          {checkoutUrl ? (
            <a
              href={checkoutUrl}
              className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-3 text-white"
            >
              Continue
            </a>
          ) : (
            <button
              type="button"
              className="rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
              onClick={startPayment}
              disabled={!canPay || loading}
            >
              {loading ? "Preparing..." : "Continue"}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
