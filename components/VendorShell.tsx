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

export default function VendorShell({
  title = "Vendor Dashboard",
  subtitle = "Vendor",
  children,
  navItems,
}: VendorShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showBankPrompt, setShowBankPrompt] = useState(false);

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
        .select("role,bank_name,bank_account_number,bank_account_name")
        .eq("id", user.id)
        .maybeSingle<{
          role?: string | null;
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
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
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
              <button
                type="button"
                className="rounded-xl bg-black px-4 py-3 text-sm text-white"
                onClick={() => {
                  setShowBankPrompt(false);
                  router.push("/vendor/withdraw");
                }}
              >
                Set details
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
