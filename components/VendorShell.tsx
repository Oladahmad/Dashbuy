/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type NavItem = {
  href: string;
  label: string;
};

type VendorShellProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  navItems: NavItem[];
};

type Bank = {
  name: string;
  code: string;
};

export default function VendorShell({
  title = "Vendor Dashboard",
  subtitle = "Vendor",
  children,
  navItems,
}: VendorShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showBankPrompt, setShowBankPrompt] = useState(false);
  const [bankPromptStep, setBankPromptStep] = useState<"intro" | "form">("intro");
  const [profileId, setProfileId] = useState("");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [savingBank, setSavingBank] = useState(false);
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountResolved, setAccountResolved] = useState(false);
  const [bankMsg, setBankMsg] = useState("");

  const items = useMemo(() => navItems.slice(0, 4), [navItems]);

  useEffect(() => {
    let alive = true;

    async function checkBankPrompt() {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        if (alive) setShowBankPrompt(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role,bank_code,bank_name,bank_account_number,bank_account_name")
        .eq("id", user.id)
        .maybeSingle<{
          role?: string | null;
          bank_code?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_account_name?: string | null;
        }>();

      if (!alive) return;

        const role = String(profile?.role ?? "").trim().toLowerCase();
        const isVendor = role === "vendor_food" || role === "vendor_products";
        const missingBank =
          !String(profile?.bank_name ?? "").trim() ||
          !String(profile?.bank_account_number ?? "").trim() ||
          !String(profile?.bank_account_name ?? "").trim();

        setProfileId(user.id);
        setBankCode(String(profile?.bank_code ?? "").trim());
        setBankName(String(profile?.bank_name ?? "").trim());
        setAccountNumber(String(profile?.bank_account_number ?? "").trim());
        setAccountName(String(profile?.bank_account_name ?? "").trim());
        setAccountResolved(
          !!String(profile?.bank_code ?? "").trim() &&
            !!String(profile?.bank_account_number ?? "").trim() &&
            !!String(profile?.bank_account_name ?? "").trim()
        );

        setShowBankPrompt(isVendor && missingBank);
      }

    void checkBankPrompt();
    return () => {
      alive = false;
    };
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/vendor") return pathname === "/vendor";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function clean(value: string | null | undefined) {
    return String(value ?? "").trim();
  }

  async function openBankForm() {
    setBankPromptStep("form");
    setBankMsg("");

    if (banks.length > 0) return;

    setLoadingBanks(true);
    const res = await fetch("/api/payouts/banks", { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; banks?: Bank[] } | null;
    setLoadingBanks(false);

    if (!res.ok || !body?.ok || !Array.isArray(body.banks)) {
      setBankMsg(body?.error ?? "Failed to load banks.");
      return;
    }

    setBanks(body.banks);
  }

  async function resolveAccountName() {
    const bc = clean(bankCode);
    const acct = clean(accountNumber);
    if (!bc) {
      setBankMsg("Select a bank first.");
      return;
    }
    if (acct.length !== 10) {
      setBankMsg("Enter a valid 10-digit account number.");
      return;
    }

    setResolvingAccount(true);
    setBankMsg("");
    const res = await fetch("/api/payouts/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankCode: bc, accountNumber: acct }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; accountName?: string } | null;
    setResolvingAccount(false);

    if (!res.ok || !body?.ok || !body.accountName) {
      setAccountResolved(false);
      setBankMsg(body?.error ?? "Could not resolve account name.");
      return;
    }

    setAccountName(body.accountName);
    setAccountResolved(true);
    setBankMsg("Account name found successfully.");
  }

  async function saveBankDetails() {
    const bc = clean(bankCode);
    const bn = clean(bankName);
    const acct = clean(accountNumber);
    const acctName = clean(accountName);

    if (!profileId) {
      setBankMsg("Profile not loaded yet.");
      return;
    }
    if (!bc) {
      setBankMsg("Select a bank.");
      return;
    }
    if (!bn) {
      setBankMsg("Bank name is required.");
      return;
    }
    if (acct.length !== 10) {
      setBankMsg("Enter a valid 10-digit account number.");
      return;
    }
    if (!acctName) {
      setBankMsg("Resolve the account name first.");
      return;
    }
    if (!accountResolved) {
      setBankMsg("Check the account name before saving.");
      return;
    }

    setSavingBank(true);
    setBankMsg("");
    const { error } = await supabase
      .from("profiles")
      .update({
        bank_code: bc,
        bank_name: bn,
        bank_account_number: acct,
        bank_account_name: acctName,
      })
      .eq("id", profileId);
    setSavingBank(false);

    if (error) {
      setBankMsg(error.message);
      return;
    }

    setShowBankPrompt(false);
    setBankPromptStep("intro");
    setBankMsg("");
  }

  return (
    <div className="min-h-dvh bg-white flex flex-col">
      <header className="sticky top-0 z-30 border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="Dashbuy" className="h-8 w-auto" />
            <div className="min-w-0 leading-tight">
              <p className="text-sm text-gray-600">{subtitle}</p>
              <h1 className="text-base font-semibold truncate">{title}</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-24">{children}</main>

      {items.length > 0 ? (
        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-white">
          <div className="mx-auto grid max-w-3xl grid-cols-4 gap-2 px-3 py-2">
            {items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={`${it.href}:${it.label}`}
                  href={it.href}
                  prefetch={false}
                  className={`rounded-xl px-3 py-3 text-center text-sm border ${
                    active ? "bg-black text-white border-black" : "bg-white text-gray-700"
                  }`}
                >
                  {it.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}

      {showBankPrompt ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            {bankPromptStep === "intro" ? (
              <>
                <p className="text-lg font-semibold text-gray-900">Set account details</p>
                <p className="mt-2 text-sm text-gray-600">
                  Add your bank account details so vendor payouts can get to you quickly once orders are delivered.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-xl border px-4 py-3 text-sm"
                    onClick={() => setShowBankPrompt(false)}
                  >
                    Cancel
                  </button>
                  <button type="button" className="rounded-xl bg-black px-4 py-3 text-sm text-white" onClick={openBankForm}>
                    Proceed
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-gray-900">Account details</p>
                <p className="mt-2 text-sm text-gray-600">
                  Enter your account number, choose your bank in the middle, then confirm the resolved account name here.
                </p>

                <div className="mt-4 grid gap-3">
                  <div>
                    <label className="text-sm text-gray-700">Account number</label>
                    <input
                      className="mt-2 w-full rounded-xl border px-3 py-3"
                      value={accountNumber}
                      onChange={(e) => {
                        setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10));
                        setAccountResolved(false);
                        setAccountName("");
                        setBankMsg("");
                      }}
                      inputMode="numeric"
                      placeholder="Enter 10-digit account number"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-700">Bank</label>
                    <select
                      className="mt-2 w-full rounded-xl border px-3 py-3 text-center"
                      value={bankCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        const bank = banks.find((item) => item.code === code);
                        setBankCode(code);
                        setBankName(bank?.name ?? "");
                        setAccountResolved(false);
                        setAccountName("");
                        setBankMsg("");
                      }}
                      disabled={loadingBanks}
                    >
                      <option value="">{loadingBanks ? "Loading banks..." : "Select bank"}</option>
                      {banks.map((bank) => (
                        <option key={bank.code} value={bank.code}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-gray-700">Account name</label>
                    <div className="mt-2 flex gap-2">
                      <input
                        className="w-full rounded-xl border px-3 py-3"
                        value={accountName}
                        placeholder="Check account name"
                        readOnly
                      />
                      <button
                        type="button"
                        className="rounded-xl border px-4 py-3 text-sm"
                        onClick={resolveAccountName}
                        disabled={savingBank || resolvingAccount || loadingBanks || !bankCode || accountNumber.length !== 10}
                      >
                        {resolvingAccount ? "Checking..." : "Check name"}
                      </button>
                    </div>
                  </div>
                </div>

                {bankMsg ? (
                  <p className={`mt-3 text-sm ${accountResolved && bankMsg.includes("successfully") ? "text-green-700" : "text-orange-600"}`}>
                    {bankMsg}
                  </p>
                ) : null}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-xl border px-4 py-3 text-sm"
                    onClick={() => {
                      setBankPromptStep("intro");
                      setBankMsg("");
                    }}
                    disabled={savingBank}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-black px-4 py-3 text-sm text-white disabled:opacity-60"
                    onClick={saveBankDetails}
                    disabled={savingBank || loadingBanks || !clean(bankCode) || !clean(bankName) || accountNumber.length !== 10 || !accountResolved}
                  >
                    {savingBank ? "Saving..." : "Save details"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
