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

const FOOD_CART_KEY = "dashbuy_food_cart_v1";
const DELIVERY_FEE = 700;

function formatNaira(n: number) {
  return `N${Math.round(n).toLocaleString()}`;
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
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const platesSubtotal = useMemo(() => plates.reduce((sum, p) => sum + Number(p.plateTotal), 0), [plates]);
  const combosSubtotal = useMemo(() => combos.reduce((sum, c) => sum + Number(c.price) * Number(c.qty), 0), [combos]);
  const subtotal = platesSubtotal + combosSubtotal;
  const total = subtotal + DELIVERY_FEE;

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

  async function placeOrder() {
    setMsg("");
    if (plates.length === 0 && combos.length === 0) return setMsg("Your cart is empty.");

    const addr = deliveryAddress.trim();
    if (!addr) return setMsg("Enter delivery address.");
    if (addr.length < 10) {
      return setMsg("Please include house number, street, area and landmark for fast delivery.");
    }

    const phoneClean = phone.trim();
    if (!phoneClean) return setMsg("Enter your phone number.");

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return setMsg("Please login first at /auth");

    const vendorId = plates[0]?.vendorId ?? combos[0]?.vendorId;
    if (!vendorId) return setMsg("Missing vendor. Add food items again.");

    setLoading(true);

    const foodMode: "plate" | "combo" = plates.length > 0 ? "plate" : "combo";
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_type: "food",
        food_mode: foodMode,
        customer_id: userId,
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
      .single();

    if (orderErr || !order) {
      setLoading(false);
      setMsg("Order error: " + (orderErr?.message ?? "unknown"));
      return;
    }

    for (const p of plates) {
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

    if (combos.length > 0) {
      const comboRows = combos.map((it) => ({
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

    localStorage.removeItem(FOOD_CART_KEY);
    setLoading(false);
    router.push(`/food/pay?orderId=${order.id}`);
  }

  if (loading) return <main className="p-6">Loading...</main>;
  const isEmpty = plates.length === 0 && combos.length === 0;

  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Checkout</h1>
      {vendorName ? <p className="mt-2 text-gray-600">Vendor: {vendorName}</p> : null}

      <section className="mt-6 rounded border p-4">
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
          <span className="font-semibold">{formatNaira(DELIVERY_FEE)}</span>
        </div>
        <div className="mt-2 flex justify-between text-lg">
          <span>Total</span>
          <span className="font-semibold">{formatNaira(total)}</span>
        </div>
      </section>

      <section className="mt-6 rounded border p-4">
        <h2 className="font-semibold">Delivery details</h2>
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
