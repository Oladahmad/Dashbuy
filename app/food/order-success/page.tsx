"use client";

import { useSearchParams } from "next/navigation";

export default function FoodOrderSuccess() {
  const sp = useSearchParams();
  const orderId = sp.get("orderId");

  return (
    <main className="p-6 max-w-xl">
      <h1 className="text-2xl font-bold">Order created ✅</h1>
      <p className="mt-2 text-gray-600">
        Payment is next. Your order id:
      </p>
      <p className="mt-2 font-mono">{orderId}</p>

      <a className="mt-6 inline-block underline" href="/food">
        Back to vendors
      </a>
    </main>
  );
}
