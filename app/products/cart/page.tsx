/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRouter } from "next/navigation";

type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  vendorId?: string | null;
  vendorName?: string | null;
};

const CART_KEY = "dashbuy_products_cart_v1";

function naira(n: number) {
  return `₦${Math.round(n).toLocaleString()}`;
}

function readCart(): { items: CartItem[] } {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : { items: [] };
  } catch {
    return { items: [] };
  }
}

function writeCart(cart: { items: CartItem[] }) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export default function ProductsCartPage() {
  const router = useRouter();

  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const cart = readCart();
    setItems(cart.items ?? []);
  }, []);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.price) * Number(it.qty), 0),
    [items]
  );
  function save(nextItems: CartItem[]) {
    setItems(nextItems);
    if (nextItems.length === 0) localStorage.removeItem(CART_KEY);
    else writeCart({ items: nextItems });
  }

  function inc(productId: string) {
    save(items.map((it) => (it.productId === productId ? { ...it, qty: it.qty + 1 } : it)));
  }

  function dec(productId: string) {
    const next = items
      .map((it) => (it.productId === productId ? { ...it, qty: it.qty - 1 } : it))
      .filter((it) => it.qty > 0);
    save(next);
  }

  function remove(productId: string) {
    save(items.filter((it) => it.productId !== productId));
  }

  function clearAll() {
    save([]);
  }

  return (
    <AppShell title="Cart">
      <button
        type="button"
        className="mb-3 rounded-xl border px-3 py-2 text-sm"
        onClick={() => router.push("/products")}
      >
        Back
      </button>
      {items.length === 0 ? (
        <div className="rounded-2xl border bg-white p-5">
          <p className="font-semibold">Your cart is empty</p>
          <p className="mt-1 text-sm text-gray-600">
            Add products and they will show here.
          </p>

          <button
            className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-white"
            onClick={() => router.push("/products")}
            type="button"
          >
            Continue shopping →
          </button>
        </div>
      ) : (
        <>
          {/* Items */}
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Items</p>
              <button
                type="button"
                className="text-sm text-gray-600 underline"
                onClick={clearAll}
              >
                Clear all
              </button>
            </div>

            <div className="mt-3 grid gap-3">
              {items.map((it) => (
                <div
                  key={it.productId}
                  className="rounded-2xl border p-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium line-clamp-1">{it.name}</p>
                    <p className="mt-1 text-xs text-gray-500 line-clamp-1">
                      {it.vendorName ? `Sold by ${it.vendorName}` : "Product"}
                    </p>
                    <p className="mt-2 text-sm font-semibold">
                      {naira(it.price)} <span className="text-gray-500">each</span>
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <button
                      type="button"
                      className="text-xs text-gray-600 underline"
                      onClick={() => remove(it.productId)}
                    >
                      Remove
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-lg border px-3 py-1"
                        onClick={() => dec(it.productId)}
                        type="button"
                      >
                        -
                      </button>
                      <span className="w-8 text-center">{it.qty}</span>
                      <button
                        className="rounded-lg border px-3 py-1"
                        onClick={() => inc(it.productId)}
                        type="button"
                      >
                        +
                      </button>
                    </div>

                    <p className="text-sm font-bold">
                      {naira(it.price * it.qty)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="mt-4 rounded-2xl border bg-white p-4">
            <div className="flex justify-between">
              <span className="text-gray-700">Subtotal</span>
              <strong>{naira(subtotal)}</strong>
            </div>

            <p className="mt-2 text-sm text-gray-600">
              Delivery fee will be calculated at checkout based on the vendor route and destination.
            </p>

            <button
              className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-white"
              onClick={() => router.push("/products/checkout")}
              type="button"
            >
              Checkout →
            </button>

            <button
              className="mt-3 w-full rounded-xl border px-4 py-3"
              onClick={() => router.push("/products")}
              type="button"
            >
              Continue shopping
            </button>
          </div>
        </>
      )}
    </AppShell>
  );
}
