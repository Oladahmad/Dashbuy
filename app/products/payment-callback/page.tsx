"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";

const CART_KEY = "dashbuy_products_cart_v1";

export default function ProductsPaymentCallbackPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const ref = sp.get("ref");
  const orderId = sp.get("orderId");

  const [msg, setMsg] = useState("Verifying payment...");

  useEffect(() => {
    (async () => {
      if (!ref || !orderId) {
        setMsg("Missing payment reference. Please return to cart.");
        return;
      }

      const res = await fetch("/api/paystack/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref }),
      });

      const data = await res.json();

      if (!data.ok || data.status !== "success") {
        setMsg("Payment not successful. If you were charged, contact support.");
        return;
      }

      // Update product order status
      const { error } = await supabase
        .from("product_orders")
        .update({ status: "paid" })
        .eq("id", orderId);

      if (error) {
        setMsg("Payment verified but saving failed: " + error.message);
        return;
      }

      localStorage.removeItem(CART_KEY);

      setMsg("Payment successful ✅ Redirecting...");
      setTimeout(() => router.push("/products/success"), 900);
    })();
  }, [ref, orderId, router]);

  return (
    <AppShell title="Payment">
      <div className="rounded-2xl border bg-white p-5">
        <p className="font-semibold">{msg}</p>

        <div className="mt-4 flex gap-2">
          <button
            className="rounded-xl border px-4 py-2"
            onClick={() => router.push("/products/cart")}
            type="button"
          >
            Back to cart
          </button>
          <button
            className="rounded-xl bg-black px-4 py-2 text-white"
            onClick={() => router.push("/products")}
            type="button"
          >
            Products
          </button>
        </div>
      </div>
    </AppShell>
  );
}
