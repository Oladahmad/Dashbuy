"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type PlateLine = {
  foodItemId: string;
  name: string;
  category: string;
  pricingType: "fixed" | "per_scoop" | "per_unit" | "variant";
  qty: number;
  unitPrice: number;
  unitLabel?: string | null;
  variantId?: string | null;
  variantName?: string | null;
};

type CartPlate = {
  vendorId: string;
  vendorName: string;
  plateTemplateId: string;
  plateName: string;
  plateFee: number;
  plateTotal: number;
  lines: PlateLine[];
  createdAt: string;
};

type ComboCartItem = {
  comboId: string;
  name: string;
  price: number;
  qty: number;
  vendorId: string;
  vendorName: string;
};

type FoodCart = {
  vendorId: string | null;
  plates: CartPlate[];
  combos: ComboCartItem[];
};

type GeoPoint = {
  lat: number;
  lng: number;
  accuracy: number | null;
};

const FOOD_CART_KEY = "dashbuy_food_cart_v1";
const DELIVERY_FEE = 700;

function formatNaira(n: number) {
  return `N${Math.round(n).toLocaleString()}`;
}

function formatGeoPoint(g: GeoPoint) {
  const base = `${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}`;
  if (g.accuracy && Number.isFinite(g.accuracy)) return `${base} (+/-${Math.round(g.accuracy)}m)`;
  return base;
}

function readCart(): FoodCart {
  if (typeof window === "undefined") return { vendorId: null, plates: [], combos: [] };
  try {
    const raw = localStorage.getItem(FOOD_CART_KEY);
    if (!raw) return { vendorId: null, plates: [], combos: [] };
    const parsed = JSON.parse(raw) as {
      vendorId?: string | null;
      plates?: CartPlate[];
      combos?: ComboCartItem[];
    };
    return {
      vendorId: parsed.vendorId ?? null,
      plates: Array.isArray(parsed.plates) ? parsed.plates : [],
      combos: Array.isArray(parsed.combos) ? parsed.combos : [],
    };
  } catch {
    return { vendorId: null, plates: [], combos: [] };
  }
}

export default function FoodCheckoutPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [plates, setPlates] = useState<CartPlate[]>([]);
  const [combos, setCombos] = useState<ComboCartItem[]>([]);
  const [vendorName, setVendorName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [geoPoint, setGeoPoint] = useState<GeoPoint | null>(null);
  const [locating, setLocating] = useState(false);
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const platesSubtotal = useMemo(() => plates.reduce((sum, p) => sum + Number(p.plateTotal), 0), [plates]);
  const combosSubtotal = useMemo(() => combos.reduce((sum, c) => sum + Number(c.price) * Number(c.qty), 0), [combos]);
  const subtotal = platesSubtotal + combosSubtotal;
  const vendorCount = useMemo(() => {
    const ids = new Set<string>();
    for (const p of plates) {
      if (p.vendorId) ids.add(p.vendorId);
    }
    for (const c of combos) {
      if (c.vendorId) ids.add(c.vendorId);
    }
    return ids.size;
  }, [plates, combos]);
  const totalDeliveryFee = vendorCount > 0 ? DELIVERY_FEE * vendorCount : 0;
  const total = subtotal + totalDeliveryFee;

  useEffect(() => {
    (async () => {
      const cart = readCart();
      setPlates(cart.plates);
      setCombos(cart.combos);
      setVendorName(cart.plates[0]?.vendorName ?? cart.combos[0]?.vendorName ?? "");

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
    if (plates.length === 0 && combos.length === 0) return setMsg("Your cart is empty.");

    const addr = deliveryAddress.trim();
    if (!addr && !geoPoint) return setMsg("Enter delivery address or extract your location before placing order.");
    if (addr && addr.length < 10) {
      return setMsg("Please include house number, street, area and landmark for fast delivery.");
    }

    const phoneClean = phone.trim();
    if (!phoneClean) return setMsg("Enter your phone number.");

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return setMsg("Please login first at /auth");

    const geoText = geoPoint ? `GPS: ${formatGeoPoint(geoPoint)}` : "";
    const hasAddr = addr.length > 0;
    const hasGeo = !!geoPoint;
    const deliveryAddressPayload = hasAddr && hasGeo ? `${addr} | ${geoText}` : hasAddr ? addr : geoText;
    const sourceText = hasAddr && hasGeo ? "manual address + geopoint" : hasGeo ? "geopoint" : "manual address";

    const notesPayload = [notes.trim(), `Location source: ${sourceText}`]
      .filter((x) => x.length > 0)
      .join(" | ");

    setLoading(true);

    const grouped = new Map<string, { plates: CartPlate[]; combos: ComboCartItem[] }>();
    for (const p of plates) {
      if (!p.vendorId) continue;
      const entry = grouped.get(p.vendorId) ?? { plates: [], combos: [] };
      entry.plates.push(p);
      grouped.set(p.vendorId, entry);
    }
    for (const c of combos) {
      if (!c.vendorId) continue;
      const entry = grouped.get(c.vendorId) ?? { plates: [], combos: [] };
      entry.combos.push(c);
      grouped.set(c.vendorId, entry);
    }

    if (grouped.size === 0) {
      setLoading(false);
      setMsg("Missing vendor. Add food items again.");
      return;
    }

    const createdOrderIds: string[] = [];

    for (const [vendorId, group] of grouped.entries()) {
      const vendorSubtotal =
        group.plates.reduce((sum, p) => sum + Number(p.plateTotal), 0) +
        group.combos.reduce((sum, c) => sum + Number(c.price) * Number(c.qty), 0);
      const vendorTotal = vendorSubtotal + DELIVERY_FEE;
      const foodMode: "plate" | "combo" = group.plates.length > 0 ? "plate" : "combo";

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          order_type: "food",
          food_mode: foodMode,
          customer_id: userId,
          vendor_id: vendorId,
          status: "pending_payment",
          subtotal: vendorSubtotal,
          delivery_fee: DELIVERY_FEE,
          total: vendorTotal,
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

      createdOrderIds.push(order.id);

      for (const p of group.plates) {
        const { data: op, error: opErr } = await supabase
          .from("order_plates")
          .insert({
            order_id: order.id,
            plate_template_id: p.plateTemplateId,
            plate_fee: p.plateFee,
            plate_total: p.plateTotal,
          })
          .select("id")
          .single();

        if (opErr || !op) {
          setLoading(false);
          setMsg("Order plate error: " + (opErr?.message ?? "unknown"));
          return;
        }

        const rows = p.lines.map((l) => ({
          order_plate_id: op.id,
          food_item_id: l.foodItemId,
          variant_id: l.variantId ?? null,
          qty: l.qty,
          unit_price: l.unitPrice,
          line_total: l.qty * l.unitPrice,
        }));

        const { error: itemsErr } = await supabase.from("order_plate_items").insert(rows);
        if (itemsErr) {
          setLoading(false);
          setMsg("Plate items error: " + itemsErr.message);
          return;
        }
      }

      if (group.combos.length > 0) {
        const comboRows = group.combos.map((it) => ({
          order_id: order.id,
          combo_food_id: it.comboId,
          qty: it.qty,
          unit_price: it.price,
          line_total: it.price * it.qty,
        }));
        const { error: comboErr } = await supabase.from("combo_order_items").insert(comboRows);
        if (comboErr) {
          setLoading(false);
          setMsg("Combo items error: " + comboErr.message);
          return;
        }
      }
    }

    localStorage.removeItem(FOOD_CART_KEY);
    setLoading(false);
    if (createdOrderIds.length === 1) {
      router.push(`/food/pay?orderId=${createdOrderIds[0]}`);
      return;
    }
    router.push("/orders");
  }

  if (loading) return <main className="p-6">Loading...</main>;
  const isEmpty = plates.length === 0 && combos.length === 0;

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-bold sm:text-2xl">Checkout</h1>
      {vendorCount === 1 && vendorName ? <p className="mt-2 text-gray-600">Vendor: {vendorName}</p> : null}
      {vendorCount > 1 ? <p className="mt-2 text-gray-600">Vendors: {vendorCount}</p> : null}

      <section className="mt-4 rounded-2xl border bg-white p-4">
        <h2 className="font-semibold">Order summary</h2>

        {isEmpty ? (
          <p className="mt-2 text-gray-600">Cart is empty.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {plates.map((p, idx) => (
              <div key={p.createdAt + idx} className="flex justify-between">
                <span>{p.plateName}</span>
                <span className="font-semibold">{formatNaira(Number(p.plateTotal))}</span>
              </div>
            ))}
            {combos.map((c) => (
              <div key={c.comboId} className="flex justify-between">
                <span>
                  {c.name} x {c.qty}
                </span>
                <span className="font-semibold">{formatNaira(Number(c.price) * Number(c.qty))}</span>
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
          <span className="font-semibold">
            {formatNaira(totalDeliveryFee)} ({vendorCount} vendor{vendorCount === 1 ? "" : "s"})
          </span>
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
              placeholder="Optional delivery note"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </section>

      {msg ? <p className="mt-4 text-sm text-red-600">{msg}</p> : null}
      <button className="mt-6 w-full rounded bg-black px-4 py-3 text-white disabled:opacity-60" onClick={placeOrder} disabled={isEmpty || loading}>
        Place order (payment next)
      </button>
    </main>
  );
}
