"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const CART_KEY = "dashbuy_products_cart_v1";
const DELIVERY_FEE = 700;

type ProductCartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  vendorId: string;
  vendorName: string;
};

type GeoPoint = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

function formatNaira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

function formatGeoPoint(g: GeoPoint) {
  const base = `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}`;
  if (g.accuracy && Number.isFinite(g.accuracy)) return `${base} (+/-${Math.round(g.accuracy)}m)`;
  return base;
}

function readCart(): { vendorId: string | null; items: ProductCartItem[] } {
  if (typeof window === "undefined") return { vendorId: null, items: [] };
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return { vendorId: null, items: [] };
    const parsed = JSON.parse(raw) as {
      vendorId?: string | null;
      items?: ProductCartItem[];
    };
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const vendorId = parsed.vendorId ?? items[0]?.vendorId ?? null;
    return {
      vendorId,
      items,
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
  const [geoPoint, setGeoPoint] = useState<GeoPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.price) * Number(it.qty), 0),
    [items]
  );

  const vendorCount = useMemo(
    () => new Set(items.map((it) => String(it.vendorId || "").trim()).filter(Boolean)).size,
    [items]
  );
  const deliveryFee = items.length ? DELIVERY_FEE * Math.max(1, vendorCount) : 0;
  const total = subtotal + deliveryFee;

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

  async function captureGeoPoint() {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setMsg("Geolocation is not available on this device/browser.");
      return;
    }

    setLocating(true);
    setMsg("");

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 1800));

      setGeoPoint({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
      });
    } catch {
      setMsg("Unable to get your location. Allow location access and try again.");
    } finally {
      setLocating(false);
    }
  }

  async function placeOrder() {
    setMsg("");

    if (items.length === 0) {
      setMsg("Your cart is empty.");
      return;
    }

    const addr = deliveryAddress.trim();
    if (!addr && !geoPoint) {
      setMsg("Enter delivery address or extract your location before placing order.");
      return;
    }
    if (addr && addr.length < 10) {
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

    const geoText = geoPoint ? `GPS: ${formatGeoPoint(geoPoint)}` : "";
    const hasAddr = addr.length > 0;
    const hasGeo = !!geoPoint;
    const deliveryAddressPayload = hasAddr && hasGeo ? `${addr} | ${geoText}` : hasAddr ? addr : geoText;
    const sourceText = hasAddr && hasGeo ? "manual address + geopoint" : hasGeo ? "geopoint" : "manual address";

    const notesPayload = [notes.trim(), `Location source: ${sourceText}`]
      .filter((x) => x.length > 0)
      .join(" | ");

    setLoading(true);

    const vendorMap = new Map<string, ProductCartItem[]>();
    for (const it of items) {
      const v = String(it.vendorId || "").trim();
      if (!v) {
        setLoading(false);
        setMsg("Vendor missing for one or more products. Please re-add items.");
        return;
      }
      const arr = vendorMap.get(v) ?? [];
      arr.push(it);
      vendorMap.set(v, arr);
    }

    const createdOrderIds: string[] = [];

    for (const [vendorId, vendorItems] of vendorMap.entries()) {
      const vendorSubtotal = vendorItems.reduce((sum, it) => sum + Number(it.price) * Number(it.qty), 0);
      const vendorTotal = vendorSubtotal + DELIVERY_FEE;

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          order_type: "product",
          food_mode: null,
          customer_id: userId,
          vendor_id: vendorId,
          status: "pending_payment",
          subtotal: vendorSubtotal,
          delivery_fee: DELIVERY_FEE,
          total: vendorTotal,
          total_amount: vendorTotal,
          delivery_address: deliveryAddressPayload,
          delivery_address_source: "manual",
          customer_phone: phoneClean,
          notes: notesPayload ? notesPayload : null,
        })
        .select("id")
        .single();

      if (orderErr || !order) {
        setLoading(false);
        setMsg("Order error: " + (orderErr?.message ?? "unknown"));
        return;
      }

      const rows = vendorItems.map((it) => ({
        order_id: order.id,
        product_id: it.productId,
        qty: it.qty,
        unit_price: it.price,
        line_total: it.qty * it.price,
      }));

      const { error: itemsErr } = await supabase.from("order_items").insert(rows);
      if (itemsErr) {
        await supabase.from("orders").delete().eq("id", order.id);
        setLoading(false);
        setMsg("Order items error: " + itemsErr.message);
        return;
      }

      createdOrderIds.push(order.id);
    }

    localStorage.removeItem(CART_KEY);
    setLoading(false);

    if (createdOrderIds.length === 1) {
      router.push(`/food/pay?orderId=${createdOrderIds[0]}`);
      return;
    }

    router.push("/orders");
  }

  if (loading) return <main className="p-6">Loading...</main>;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-bold sm:text-2xl">Checkout</h1>

      {vendorCount === 1 && vendorName ? <p className="mt-2 text-gray-600">Vendor: {vendorName}</p> : null}
      {vendorCount > 1 ? <p className="mt-2 text-gray-600">Vendors: {vendorCount}</p> : null}

      <section className="mt-4 rounded-2xl border bg-white p-4">
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
          <span>Delivery fee ({vendorCount} vendor{vendorCount === 1 ? "" : "s"})</span>
          <span className="font-semibold">{formatNaira(deliveryFee)}</span>
        </div>

        <div className="mt-2 flex justify-between text-lg">
          <span>Total</span>
          <span className="font-semibold">{formatNaira(total)}</span>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Delivery details</h2>

        <p className="mt-2 text-sm text-gray-600">
          Do not use location capture if you are not within the delivery area. Enter your delivery address and capture your exact location.
        </p>

        <div className="mt-4 grid gap-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
            <label className="text-sm font-medium text-blue-900">Exact geopoint</label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded border border-blue-300 bg-white px-3 py-2 text-sm text-blue-900"
                onClick={captureGeoPoint}
                disabled={locating}
              >
                {locating ? "Extracting location..." : "Use my current location"}
              </button>
              {geoPoint ? (
                <span className="inline-flex items-center gap-2 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-sm text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  Location extracted
                </span>
              ) : null}
            </div>
          </div>

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
