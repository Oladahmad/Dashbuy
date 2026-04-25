"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

const CART_KEY = "dashbuy_products_cart_v1";
const DELIVERY_FEE = 900;

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

function isLocalHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function geoErrorMessage(err: unknown) {
  const code = (err as GeolocationPositionError | undefined)?.code;
  if (code === 1) return "Location permission is blocked on this phone/browser. Enable location permission and try again.";
  if (code === 2) return "Location is unavailable right now. Turn on GPS and mobile data, then try again.";
  if (code === 3) return "Location request timed out. Move to open sky and try again.";
  return "Unable to get your location. Check permission, GPS, and internet, then try again.";
}

function getPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

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
  const [payMethod, setPayMethod] = useState<"wallet" | "card">("card");
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletPinEnabled, setWalletPinEnabled] = useState(false);
  const [walletPin, setWalletPin] = useState("");

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
        router.replace("/auth/login?next=%2Fproducts%2Fcheckout");
        return;
      }

      const token = sessionData.session?.access_token ?? "";
      if (token) {
        const balRes = await fetch("/api/wallet/balance", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const balBody = (await balRes.json().catch(() => null)) as { ok?: boolean; balance?: number } | null;
        if (balRes.ok && balBody?.ok) {
          setWalletBalance(Number(balBody.balance ?? 0));
        }

        const pinRes = await fetch("/api/wallet/pin", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        const pinBody = (await pinRes.json().catch(() => null)) as { ok?: boolean; enabled?: boolean } | null;
        if (pinRes.ok && pinBody?.ok) {
          setWalletPinEnabled(!!pinBody.enabled);
        }
      }

      setLoading(false);
    })();
  }, [router]);

  async function captureGeoPoint() {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setMsg("Geolocation is not available on this device/browser.");
      return;
    }
    if (!window.isSecureContext && !isLocalHost()) {
      setMsg("Location capture requires HTTPS. On mobile, use your secure deployed URL (not local network HTTP).");
      return;
    }

    setLocating(true);
    setMsg("");

    try {
      if ("permissions" in navigator && navigator.permissions?.query) {
        const p = await navigator.permissions.query({ name: "geolocation" as PermissionName });
        if (p.state === "denied") {
          setMsg("Location permission is denied. Enable it in browser settings and try again.");
          return;
        }
      }

      let pos: GeolocationPosition;
      try {
        pos = await getPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      } catch {
        pos = await getPosition({ enableHighAccuracy: false, timeout: 20000, maximumAge: 300000 });
      }

      await new Promise((resolve) => setTimeout(resolve, 1800));

      setGeoPoint({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
      });
      const accuracy = Number(pos.coords.accuracy || 0);
      if (accuracy > 200) {
        setMsg(`Location captured but accuracy is low (+/-${Math.round(accuracy)}m). For better result, move outdoors and recapture.`);
      }
    } catch (err) {
      setMsg(geoErrorMessage(err));
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
    if (!addr) {
      setMsg("Enter your delivery address before continuing.");
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
      router.push("/auth/login?next=%2Fproducts%2Fcheckout");
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

    const { data: refreshedSessionData } = await supabase.auth.getSession();
    const session = refreshedSessionData.session;
    const token = session?.access_token;
    const email = session?.user?.email?.trim() ?? "";
    if (!token) {
      setLoading(false);
      router.push("/auth/login?next=%2Fproducts%2Fcheckout");
      return;
    }

    if (payMethod === "wallet") {
      const payRes = await fetch("/api/wallet/pay-orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderIds: createdOrderIds, pin: walletPin }),
      });
      const payBody = (await payRes.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!payRes.ok || !payBody?.ok) {
        setLoading(false);
        setMsg(payBody?.error ?? "Wallet payment failed. You can try card payment.");
        return;
      }
      localStorage.removeItem(CART_KEY);
      setLoading(false);
      const successQuery =
        createdOrderIds.length === 1
          ? `orderId=${encodeURIComponent(createdOrderIds[0])}`
          : `orderIds=${encodeURIComponent(createdOrderIds.join(","))}`;
      router.push(`/products/success?${successQuery}`);
      return;
    }

    if (!email) {
      setLoading(false);
      setMsg("Missing customer email on your account. Please log in again.");
      return;
    }

    const paymentRes = await fetch("/api/paystack/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        orderId: createdOrderIds.length === 1 ? createdOrderIds[0] : undefined,
        orderIds: createdOrderIds,
        email,
      }),
    });
    const paymentBody = (await paymentRes.json().catch(() => null)) as
      | { ok?: boolean; error?: string; authorization_url?: string }
      | null;

    if (!paymentRes.ok || !paymentBody?.ok || !paymentBody.authorization_url) {
      setLoading(false);
      setMsg(paymentBody?.error ?? "Unable to continue payment.");
      return;
    }

    localStorage.removeItem(CART_KEY);
    setLoading(false);
    window.location.href = paymentBody.authorization_url;
  }

  if (loading) return <main className="p-6">Loading...</main>;

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <button
        type="button"
        className="mb-4 rounded-xl border px-3 py-2 text-sm"
        onClick={() => router.push("/products/cart")}
      >
        Back
      </button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Checkout</h1>
        <p className="mt-2 text-sm text-gray-600">Keep this simple: confirm address, choose payment, place order.</p>
        {vendorCount === 1 && vendorName ? <p className="mt-2 text-sm text-gray-600">Vendor: {vendorName}</p> : null}
        {vendorCount > 1 ? <p className="mt-2 text-sm text-gray-600">Vendors: {vendorCount}</p> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Delivery details</h2>
        <p className="mt-2 text-sm text-gray-600">
          Enter the full delivery address. If you are already at the delivery point, capture your current location to help logistics find you faster.
        </p>

        <div className="mt-5 grid gap-4">
          <div>
            <label className="text-sm font-medium">Delivery address</label>
            <div className="mt-2 overflow-hidden rounded-2xl border">
              <textarea
                className="w-full border-0 p-4 focus:outline-none"
                rows={4}
                placeholder="House number, street, area, landmark"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
              <div className="flex items-center justify-between border-t bg-gray-50 px-4 py-3">
                <button
                  type="button"
                  className="rounded-lg border bg-white px-3 py-2 text-sm"
                  onClick={captureGeoPoint}
                  disabled={locating}
                >
                  {locating ? "Capturing..." : "Capture location"}
                </button>
                {geoPoint ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Location captured
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">Optional but recommended</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Phone number</label>
              <input
                className="mt-2 w-full rounded-xl border p-3"
                placeholder="080..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Note</label>
              <textarea
                className="mt-2 w-full rounded-xl border p-3"
                rows={4}
                placeholder="Optional, for example call on arrival, gate code, directions"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-semibold">Payment method</h2>
        <p className="mt-2 text-sm text-gray-600">Choose wallet or continue to the payment gateway.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-xl border px-3 py-3 text-sm ${payMethod === "card" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setPayMethod("card")}
          >
            Payment gateway
          </button>
          <button
            type="button"
            className={`rounded-xl border px-3 py-3 text-sm ${payMethod === "wallet" ? "bg-black text-white" : "bg-white"}`}
            onClick={() => setPayMethod("wallet")}
          >
            Wallet
          </button>
        </div>

        {payMethod === "wallet" ? (
          <div className="mt-4 rounded-2xl border p-4">
            <p className="text-xs text-gray-600">Wallet balance</p>
            <p className="mt-1 text-lg font-semibold">{formatNaira(walletBalance)}</p>
            {walletBalance < total ? (
              <p className="mt-3 text-xs text-red-600">Wallet balance is not enough for this order.</p>
            ) : null}
            {!walletPinEnabled ? (
              <p className="mt-3 text-xs text-red-600">Set your wallet PIN first in Account before paying with wallet.</p>
            ) : (
              <div className="mt-4">
                <label className="text-xs text-gray-600">Wallet PIN</label>
                <input
                  className="mt-2 w-full rounded-xl border p-3"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Enter your 4-digit PIN"
                  value={walletPin}
                  onChange={(e) => setWalletPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
            )}
            <button
              type="button"
              className="mt-3 rounded-xl border px-3 py-2 text-sm"
              onClick={() => router.push("/account/add-funds")}
            >
              Add funds
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border bg-gray-50 p-4 text-sm text-gray-600">
            You’ll be redirected to the payment gateway to complete this order.
          </div>
        )}
      </section>
      </div>

      <aside className="lg:sticky lg:top-24">
      <section className="rounded-2xl border bg-white p-5">
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
      {msg ? <p className="mt-4 text-sm text-red-600">{msg}</p> : null}

      <button
        className="mt-6 w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-60"
        onClick={placeOrder}
        disabled={items.length === 0 || loading || (payMethod === "wallet" && (walletBalance < total || !walletPinEnabled || walletPin.length !== 4))}
      >
        {payMethod === "wallet" ? "Continue with wallet" : "Continue to payment gateway"}
      </button>
      </section>
      </aside>
      </div>
    </main>
  );
}
