"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const CART_KEY = "dashbuy_combo_cart_v1";
const DELIVERY_FEE = 700;

type ComboCartItem = {
  comboId: string;
  name: string;
  price: number;
  qty: number;
  vendorId: string;
  vendorName: string;
};

function naira(n: number) {
  return `₦${Math.round(n).toLocaleString()}`;
}

function readCart(): { vendorId: string | null; vendorName: string | null; items: ComboCartItem[] } {
  if (typeof window === "undefined") return { vendorId: null, vendorName: null, items: [] };
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return { vendorId: null, vendorName: null, items: [] };
    const parsed = JSON.parse(raw);
    return {
      vendorId: parsed.vendorId ?? null,
      vendorName: parsed.vendorName ?? null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { vendorId: null, vendorName: null, items: [] };
  }
}

function safeNumber(x: unknown, fallback = 0) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    const sample = text.slice(0, 160).replace(/\s+/g, " ").trim();
    throw new Error(`API ${url} did not return JSON. Status ${res.status}. Body starts with: ${sample}`);
  }

  if (!res.ok) {
    const errMsg = json?.error || json?.message || `Request failed: ${res.status}`;
    throw new Error(errMsg);
  }

  return json as T;
}

export default function ComboCheckoutPage() {
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState("");

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState<string | null>(null);
  const [items, setItems] = useState<ComboCartItem[]>([]);

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + safeNumber(it.price, 0) * safeNumber(it.qty, 0), 0),
    [items]
  );

  const total = subtotal + (items.length ? DELIVERY_FEE : 0);

  useEffect(() => {
    (async () => {
      const cart = readCart();
      setVendorId(cart.vendorId);
      setVendorName(cart.vendorName);
      setItems(cart.items);

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        setMsg("Please login first at /auth");
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase.from("profiles").select("phone").eq("id", userId).single();
      if (profile?.phone) setPhone(String(profile.phone ?? ""));

      setLoading(false);
    })();
  }, []);

  async function payNow() {
    setMsg("");

    if (!vendorId) return setMsg("Vendor missing. Add combos again.");
    if (items.length === 0) return setMsg("Cart is empty.");

    const addr = deliveryAddress.trim();
    if (!addr) return setMsg("Enter delivery address.");
    if (addr.length < 10) return setMsg("Please include full address details for fast delivery.");

    const phoneClean = phone.trim();
    if (!phoneClean) return setMsg("Enter phone number.");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return setMsg("Please login first at /auth");

    setPaying(true);

    try {
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          order_type: "food",
          food_mode: "combo",
          customer_id: user.id,
          vendor_id: vendorId,
          status: "pending_payment",
          subtotal,
          delivery_fee: DELIVERY_FEE,
          total,
          delivery_address: addr,
          customer_phone: phoneClean,
          notes: notes.trim() ? notes.trim() : null,
        })
        .select("id")
        .single<{ id: string }>();

      if (orderErr || !order) {
        setPaying(false);
        return setMsg("Order error: " + (orderErr?.message ?? "unknown"));
      }

      const rows = items.map((it) => ({
        order_id: order.id,
        combo_food_id: it.comboId,
        qty: it.qty,
        unit_price: it.price,
        line_total: it.price * it.qty,
      }));

      const { error: itemsErr } = await supabase.from("combo_order_items").insert(rows);
      if (itemsErr) {
        setPaying(false);
        return setMsg("Combo items error: " + itemsErr.message);
      }

      await postJson<{ ok: boolean }>("/api/logistics/precreate", {
  orderId: order.id,
  deliveryAddress: addr,
  customerPhone: phoneClean,
});


      const initJson = await postJson<{ authorization_url: string }>("/api/paystack/init", {
        email: user.email,
        amountKobo: Math.round(total * 100),
        reference: `dashbuy_${order.id}_${Date.now()}`,
        callbackUrl: `${window.location.origin}/food/pay/callback?orderId=${order.id}`,
        metadata: { orderId: order.id, type: "food_combo" },
      });

      const url = String(initJson?.authorization_url ?? "");
      if (!url) {
        setPaying(false);
        return setMsg("Paystack init did not return authorization_url");
      }

      localStorage.removeItem(CART_KEY);

      window.location.href = url;
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "Something went wrong";
      setPaying(false);
      setMsg(m);
    }
  }

  if (loading) return <main className="p-6">Loading...</main>;

  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Combo Checkout</h1>

      {vendorName ? (
        <p className="mt-2 text-gray-600">
          Vendor: <span className="font-semibold">{vendorName}</span>
        </p>
      ) : null}

      <section className="mt-6 rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Order summary</h2>

        <div className="mt-3 grid gap-2">
          {items.map((it) => (
            <div key={it.comboId} className="flex justify-between text-sm">
              <span>
                {it.name} × {it.qty}
              </span>
              <span className="font-semibold">{naira(it.price * it.qty)}</span>
            </div>
          ))}
        </div>

        <hr className="my-3" />

        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="font-semibold">{naira(subtotal)}</span>
        </div>

        <div className="flex justify-between">
          <span>Delivery fee</span>
          <span className="font-semibold">{naira(DELIVERY_FEE)}</span>
        </div>

        <div className="mt-2 flex justify-between text-lg">
          <span>Total</span>
          <span className="font-semibold">{naira(total)}</span>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Delivery details</h2>

        <p className="mt-2 text-xs text-gray-600">
          Add house number, street, area, landmark, and any gate instructions for fast delivery.
        </p>

        <div className="mt-4 grid gap-3">
          <div>
            <label className="text-sm font-medium">Delivery address</label>
            <textarea
              className="mt-1 w-full rounded-xl border p-3"
              rows={3}
              placeholder="House number, street, area, landmark, city"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              disabled={paying}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Phone number</label>
            <input
              className="mt-1 w-full rounded-xl border p-3"
              placeholder="e.g. 08012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={paying}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Notes</label>
            <textarea
              className="mt-1 w-full rounded-xl border p-3"
              rows={3}
              placeholder="Optional. e.g. call on arrival, deliver to security"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={paying}
            />
          </div>
        </div>
      </section>

      {msg ? <p className="mt-4 text-sm text-red-600">{msg}</p> : null}

      <button
        className="mt-6 w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
        onClick={payNow}
        disabled={items.length === 0 || paying}
        type="button"
      >
        {paying ? "Redirecting..." : "Pay with Paystack"}
      </button>
    </main>
  );
}
