/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useMemo } from "react";

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

  const items = useMemo(() => navItems.slice(0, 4), [navItems]);

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
    </div>
  );
}
