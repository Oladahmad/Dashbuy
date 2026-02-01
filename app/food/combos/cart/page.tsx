/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const CART_KEY = "dashbuy_combo_cart_v1";
const DELIVERY_FEE = 700;

function naira(n: number) {
  return `₦${Math.round(n).toLocaleString()}`;
}

export default function ComboCartPage() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [cart, setCart] = useState<any>({ vendorId: null, vendorName: null, items: [] });

  useEffect(() => {
    const raw = localStorage.getItem(CART_KEY);
    setCart(raw ? JSON.parse(raw) : { vendorId: null, vendorName: null, items: [] });
  }, []);

  const subtotal = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => cart.items.reduce((sum: number, it: any) => sum + Number(it.price) * Number(it.qty), 0),
    [cart.items]
  );
  const total = subtotal + (cart.items.length ? DELIVERY_FEE : 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function save(next: any) {
    setCart(next);
    if (!next.items.length) localStorage.removeItem(CART_KEY);
    else localStorage.setItem(CART_KEY, JSON.stringify(next));
  }

  function inc(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    save({ ...cart, items: cart.items.map((x: any) => (x.comboId === id ? { ...x, qty: x.qty + 1 } : x)) });
  }

  function dec(id: string) {
    const nextItems = cart.items
      .map((x: any) => (x.comboId === id ? { ...x, qty: x.qty - 1 } : x))
      .filter((x: any) => x.qty > 0);
    save({ ...cart, items: nextItems });
  }

  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Combo Cart</h1>
      {cart.vendorName ? (
        <p className="mt-2 text-gray-600">
          Vendor: <strong>{cart.vendorName}</strong>
        </p>
      ) : null}

      {cart.items.length === 0 ? (
        <p className="mt-6 text-gray-600">Cart is empty.</p>
      ) : (
        <>
          <div className="mt-6 grid gap-3">
            {cart.items.map((it: any) => (
              <div key={it.comboId} className="rounded-2xl border bg-white p-4 flex justify-between">
                <div>
                  <p className="font-semibold">{it.name}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {naira(it.price)} × {it.qty} = <strong>{naira(it.price * it.qty)}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="rounded border px-3 py-1" onClick={() => dec(it.comboId)}>-</button>
                  <span className="w-8 text-center">{it.qty}</span>
                  <button className="rounded border px-3 py-1" onClick={() => inc(it.comboId)}>+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border bg-white p-4">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <strong>{naira(subtotal)}</strong>
            </div>
            <div className="flex justify-between mt-1">
              <span>Delivery fee</span>
              <strong>{naira(DELIVERY_FEE)}</strong>
            </div>
            <div className="flex justify-between mt-2 text-lg">
              <span>Total</span>
              <strong>{naira(total)}</strong>
            </div>

            <button
              className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-white"
              onClick={() => router.push("/food/combos/checkout")}
            >
              Checkout
            </button>
          </div>
        </>
      )}
    </main>
  );
}
