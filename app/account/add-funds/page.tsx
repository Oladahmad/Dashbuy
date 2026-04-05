"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [checking, setChecking] = useState(false);
  const [dva, setDva] = useState<{ account_number: string; account_name: string; bank_name: string; amount: number } | null>(null);
  const [balanceStart, setBalanceStart] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceErr, setBalanceErr] = useState("");
  const [lastChecked, setLastChecked] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (user?.email) setEmail(user.email);
      const token = data.session?.access_token ?? "";
      if (token) {
        const balRes = await fetch("/api/wallet/balance", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const balBody = (await balRes.json().catch(() => null)) as { ok?: boolean; balance?: number } | null;
        if (balRes.ok && balBody?.ok) {
          const next = Number(balBody.balance ?? 0);
          setBalanceStart(next);
          setBalance(next);
          setBalanceErr("");
        } else {
          setBalanceErr("Unable to load wallet balance.");
        }
      }
    })();
  }, []);

  const canPay = useMemo(() => {
    const amt = Number(amount);
    return email.trim().length > 3 && Number.isFinite(amt) && amt > 0;
  }, [email, amount]);

  async function startPayment() {
    setMsg("");
    if (!canPay) return;
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    if (!token) {
      setLoading(false);
      setMsg("Please sign in again to continue.");
      router.push("/auth/login");
      return;
    }

    const res = await fetch("/api/paystack/dva/wallet-init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ amount: Number(amount) }),
    });

    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; account_number?: string; account_name?: string; bank_name?: string; amount?: number }
      | null;
    if (!res.ok || !body?.ok || !body.account_number) {
      setLoading(false);
      setMsg(body?.error ?? "Unable to create transfer account.");
      return;
    }

    setDva({
      account_number: body.account_number,
      account_name: body.account_name ?? "",
      bank_name: body.bank_name ?? "",
      amount: Number(body.amount ?? 0),
    });
    setMsg("Transfer to the account below to fund your wallet.");
    setLoading(false);
  }

  useEffect(() => {
    if (!dva || startedRef.current) return;
    startedRef.current = true;
    const timer = setInterval(async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      if (!token) return;
      const balRes = await fetch("/api/wallet/balance", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const balBody = (await balRes.json().catch(() => null)) as { ok?: boolean; balance?: number } | null;
      if (balRes.ok && balBody?.ok) {
        const next = Number(balBody.balance ?? 0);
        setBalance(next);
        setBalanceErr("");
        setLastChecked(new Date().toLocaleTimeString());
        if (next > balanceStart) {
          clearInterval(timer);
          setMsg("Wallet funded successfully. Redirecting...");
          setTimeout(() => router.push("/account"), 1000);
        }
      } else {
        setBalanceErr("Unable to load wallet balance.");
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [dva, balanceStart, router]);

  async function manualCheckBalance() {
    if (checking) return;
    setChecking(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    if (!token) {
      setChecking(false);
      setMsg("Please sign in again to continue.");
      router.push("/auth/login");
      return;
    }
    const balRes = await fetch("/api/wallet/balance", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const balBody = (await balRes.json().catch(() => null)) as { ok?: boolean; balance?: number } | null;
    if (balRes.ok && balBody?.ok) {
      const next = Number(balBody.balance ?? 0);
      setBalance(next);
      setBalanceErr("");
      setLastChecked(new Date().toLocaleTimeString());
      if (next > balanceStart) {
        setMsg("Wallet funded successfully. Redirecting...");
        setTimeout(() => router.push("/account"), 1000);
        return;
      }
      setMsg("We're still waiting for confirmation. It can take a few minutes after transfer.");
    } else {
      setBalanceErr("Unable to load wallet balance.");
    }
    setChecking(false);
  }


  return (
    <AppShell title="Add funds">
      <div className="rounded-2xl border bg-white p-5">
        <p className="text-sm text-gray-600">Wallet top up</p>
        <p className="text-base font-semibold">Add funds to your Dashbuy wallet</p>
        <p className="mt-1 text-sm text-gray-600">Pay by bank transfer using a dedicated virtual account.</p>
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

        {dva ? (
          <div className="rounded-2xl border bg-white p-4 space-y-2">
            <div>
              <p className="text-xs text-gray-600">Bank</p>
              <p className="text-base font-semibold">{dva.bank_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Account number</p>
              <p className="text-base font-semibold">{dva.account_number}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Account name</p>
              <p className="text-base font-semibold">{dva.account_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Amount</p>
              <p className="text-lg font-bold">N{Math.round(dva.amount).toLocaleString()}</p>
            </div>
            <p className="text-xs text-gray-500">Transfer to this account. Your wallet will update automatically.</p>
            <p className="text-xs text-gray-500">Please send the exact amount. Wrong amounts may delay confirmation.</p>
            <button
              type="button"
              className="w-full rounded-xl border px-4 py-3 text-sm"
              onClick={manualCheckBalance}
              disabled={checking}
            >
              {checking ? "Checking payment..." : "I've sent the money"}
            </button>
            <div className="rounded-xl border bg-gray-50 p-3 text-xs text-gray-600">
              {lastChecked ? (
                <p>Last checked: {lastChecked}. Waiting for payment confirmation...</p>
              ) : (
                <p>Waiting for payment confirmation...</p>
              )}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="rounded-xl border px-4 py-3" onClick={() => router.push("/account")} disabled={loading}>
            Back
          </button>
          <button
            type="button"
            className="rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
            onClick={startPayment}
            disabled={!canPay || loading}
          >
            {loading ? "Preparing..." : "Get transfer account"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

