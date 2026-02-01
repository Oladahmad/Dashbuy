"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const CART_KEY = "dashbuy_product_cart_v1";
const DELIVERY_FEE = 700;

type ProductCartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  vendorId: string;
  vendorName: string;
};

function formatNaira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

function readCart(): { vendorId: string | null; items: ProductCartItem[] } {
  if (typeof window === "undefined") return { vendorId: null, items: [] };
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return { vendorId: null, items: [] };
    const parsed = JSON.parse(raw);
    return {
      vendorId: parsed.vendorId ?? null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { vendorId: null, items: [] };
  }
}

export default function ProductCheckoutPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [items, setItems] = useState<ProductCartItem[]>([]);
  const [vendorName, setVendorName] = useState("");

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.price) * Number(it.qty), 0),
    [items]
  );

  const total = subtotal + (items.length ? DELIVERY_FEE : 0);

  useEffect(() => {
    (async () => {
      const cart = readCart();
      setItems(cart.items);
      setVendorName(cart.items[0]?.vendorName ?? "");

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        setMsg("Please login first at /auth");
        setLoading(false);
        return;
      }

      setLoading(false);
    })();
  }, []);

  async function placeOrder() {
    setMsg("");

    if (items.length === 0) {
      setMsg("Your cart is empty.");
      return;
    }

    const addr = deliveryAddress.trim();
    if (!addr) {
      setMsg("Enter delivery address.");
      return;
    }

    if (addr.length < 10) {
      setMsg("Please include good address details for fast delivery, for example house number, street, area, landmark.");
      return;
    }

    const phoneClean = phone.trim();
    if (!phoneClean) {
      setMsg("Enter your phone number.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      setMsg("Please login first at /auth");
      return;
    }

    const vendorId = items[0].vendorId;

    const allSameVendor = items.every((it) => it.vendorId === vendorId);
    if (!allSameVendor) {
      setMsg("Your cart contains items from multiple vendors. Please checkout one vendor at a time.");
      return;
    }

    setLoading(true);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_type: "product",
        food_mode: null,
        customer_id: userId,
        vendor_id: vendorId,
        status: "pending_payment",
        subtotal,
        delivery_fee: DELIVERY_FEE,
        total,
        total_amount: total,
        delivery_address: addr,
        delivery_address_source: "manual",
        customer_phone: phoneClean,
        notes: notes.trim() ? notes.trim() : null,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      setLoading(false);
      setMsg("Order error: " + (orderErr?.message ?? "unknown"));
      return;
    }

    const rows = items.map((it) => ({
      order_id: order.id,
      product_id: it.productId,
      qty: it.qty,
      unit_price: it.price,
      line_total: it.qty * it.price,
    }));

    const { error: itemsErr } = await supabase.from("order_items").insert(rows);

    if (itemsErr) {
      setLoading(false);
      setMsg("Order items error: " + itemsErr.message);
      return;
    }

    const snapRes = await fetch("/api/logistics/precreate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        customerAddress: addr,
        customerPhone: phoneClean,
        customerNotes: notes.trim() ? notes.trim() : null,
      }),
    });

    const snapJson = await snapRes.json();
    if (!snapRes.ok || !snapJson?.ok) {
      setLoading(false);
      setMsg(snapJson?.error ?? "Failed to create logistics job snapshot");
      return;
    }

    localStorage.removeItem(CART_KEY);

    setLoading(false);
    router.push(`/product/pay?orderId=${order.id}`);
  }

  if (loading) return <main className="p-6">Loading...</main>;

  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Checkout</h1>

      {vendorName ? <p className="mt-2 text-gray-600">Vendor: {vendorName}</p> : null}

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Your items</h2>

        {items.length === 0 ? (
          <p className="mt-2 text-gray-600">Cart is empty.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {items.map((it) => (
              <div key={it.productId} className="flex justify-between">
                <span>
                  {it.name} × {it.qty}
                </span>
                <span className="font-semibold">{formatNaira(Number(it.price) * Number(it.qty))}</span>
              </div>
            ))}
          </div>
        )}

        <hr className="my-3" />

        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="font-semibold">{formatNaira(subtotal)}</span>
        </div>

        <div className="flex justify-between">
          <span>Delivery fee</span>
          <span className="font-semibold">{formatNaira(items.length ? DELIVERY_FEE : 0)}</span>
        </div>

        <div className="mt-2 flex justify-between text-lg">
          <span>Total</span>
          <span className="font-semibold">{formatNaira(total)}</span>
        </div>
      </section>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Delivery details</h2>

        <p className="mt-2 text-sm text-gray-600">
          Please include good address details for fast delivery. Add house number, street, area, closest landmark, and a
          phone number that will be reachable.
        </p>

        <div className="mt-4 grid gap-3">
          <div>
            <label className="text-sm font-medium">Delivery address</label>
            <textarea
              className="mt-1 w-full rounded border p-2"
              rows={3}
              placeholder="House number, street, area, landmark"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Phone number</label>
            <input
              className="mt-1 w-full rounded border p-2"
              placeholder="080..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Note</label>
            <textarea
              className="mt-1 w-full rounded border p-2"
              rows={3}
              placeholder="Optional, for example call on arrival, gate code, directions"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </section>

      {msg ? <p className="mt-4 text-sm text-red-600">{msg}</p> : null}

      <button
        className="mt-6 w-full rounded bg-black px-4 py-3 text-white disabled:opacity-60"
        onClick={placeOrder}
        disabled={items.length === 0 || loading}
      >
        Place order (payment next)
      </button>
    </main>
  );
}
