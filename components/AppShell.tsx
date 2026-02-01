"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type AppShellProps = {
  title: string;
  children: React.ReactNode;
};

const PRODUCTS_CART_KEY = "dashbuy_products_cart_v1";
const FOOD_CART_KEYS = ["dashbuy_food_cart_v1", "dashbuy_food_cart", "dashbuy_cart_v1"];

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

function sumQty(arr: unknown[]): number {
  return arr.reduce<number>((s: number, x: unknown) => {
    if (!isRecord(x)) return s + 1;

    const qty = x.qty;

    const n =
      typeof qty === "number"
        ? qty
        : typeof qty === "string"
          ? Number(qty)
          : NaN;

    return s + (Number.isFinite(n) && n > 0 ? n : 1);
  }, 0);
}


function countCartItemsFromUnknownShape(value: unknown): number {
  if (!value) return 0;

  const direct = asArray(value);
  if (direct) return direct.length;

  if (!isRecord(value)) return 0;

  const items = asArray(value.items);
  if (items) return sumQty(items);

  const cart = asArray(value.cart);
  if (cart) return sumQty(cart);

  const plates = asArray(value.plates);
  if (plates) return sumQty(plates);

  const combos = asArray(value.combos);
  if (combos) return sumQty(combos);

  return 0;
}

function getProductsCartCount(): number {
  if (typeof window === "undefined") return 0;
  const parsed = safeParse(localStorage.getItem(PRODUCTS_CART_KEY));
  return countCartItemsFromUnknownShape(parsed);
}

function getFoodCartCount(): number {
  if (typeof window === "undefined") return 0;

  for (const key of FOOD_CART_KEYS) {
    const parsed = safeParse(localStorage.getItem(key));
    const count = countCartItemsFromUnknownShape(parsed);
    if (count > 0) return count;
  }
  return 0;
}

export default function AppShell({ title, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [cartOpen, setCartOpen] = useState(false);
  const [productsCount, setProductsCount] = useState(0);
  const [foodCount, setFoodCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setProductsCount(getProductsCartCount());
      setFoodCount(getFoodCartCount());
    };

    refresh();

    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);

    const t = window.setInterval(refresh, 1200);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(t);
    };
  }, []);

  const totalCount = useMemo(() => productsCount + foodCount, [productsCount, foodCount]);

  const nav = [
    { href: "/", label: "Home" },
    { href: "/food", label: "Food" },
    { href: "/products", label: "Products" },
    { href: "/account", label: "Account" },
  ];

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname?.startsWith(href);
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="sticky top-0 z-40 bg-white border-b">
        <div className="mx-auto max-w-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="shrink-0 flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Dashbuy"
                width={36}
                height={36}
                className="rounded-lg"
                priority
              />
              <span className="text-base font-semibold text-gray-900">Dashbuy</span>
            </Link>

            <span className="text-sm text-gray-500 truncate">{title}</span>
          </div>

          <button
            type="button"
            className="relative rounded-xl border bg-white px-3 py-2 text-sm"
            onClick={() => setCartOpen(true)}
          >
            Cart
            {totalCount > 0 ? (
              <span className="absolute -top-2 -right-2 min-w-6 h-6 px-2 rounded-full bg-black text-white text-xs flex items-center justify-center">
                {totalCount}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-4 pb-24">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t">
        <div className="mx-auto max-w-xl px-4 py-2 grid grid-cols-4 gap-2">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-xl px-3 py-3 text-center text-sm border ${
                isActive(n.href) ? "bg-black text-white border-black" : "bg-white text-gray-700"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </div>
      </nav>

      {cartOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold">Choose cart</p>
              <button
                type="button"
                className="rounded-lg border px-3 py-1 text-sm"
                onClick={() => setCartOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                className="w-full rounded-xl bg-black px-4 py-3 text-white flex items-center justify-between"
                onClick={() => {
                  setCartOpen(false);
                  router.push("/food/cart");
                }}
              >
                <span>Food cart</span>
                <span className="text-white/80">{foodCount > 0 ? foodCount : ""}</span>
              </button>

              <button
                type="button"
                className="w-full rounded-xl border px-4 py-3 flex items-center justify-between"
                onClick={() => {
                  setCartOpen(false);
                  router.push("/products/cart");
                }}
              >
                <span>Products cart</span>
                <span className="text-gray-600">{productsCount > 0 ? productsCount : ""}</span>
              </button>
            </div>

            <div className="mt-3 grid gap-2">
              <button
                type="button"
                className="w-full rounded-xl border px-4 py-3"
                onClick={() => {
                  setCartOpen(false);
                  router.push("/orders");
                }}
              >
                View orders
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
