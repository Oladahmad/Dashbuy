"use client";

import { useEffect, useMemo, useState } from "react";
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
const LEGACY_COMBO_CART_KEY = "dashbuy_combo_cart_v1";

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

function readLegacyComboCart(): ComboCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEGACY_COMBO_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: ComboCartItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function writeCart(vendorId: string | null, plates: CartPlate[], combos: ComboCartItem[]) {
  if (!vendorId || (plates.length === 0 && combos.length === 0)) {
    localStorage.removeItem(FOOD_CART_KEY);
    return;
  }
  localStorage.setItem(FOOD_CART_KEY, JSON.stringify({ vendorId, plates, combos }));
}

export default function FoodCartPage() {
  const router = useRouter();
  const [plates, setPlates] = useState<CartPlate[]>([]);
  const [combos, setCombos] = useState<ComboCartItem[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState<string>("");

  useEffect(() => {
    const c = readCart();
    const legacyCombos = readLegacyComboCart();
    const mergedCombos = c.combos.length > 0 ? c.combos : legacyCombos;
    const resolvedVendorId = c.vendorId ?? mergedCombos[0]?.vendorId ?? c.plates[0]?.vendorId ?? null;

    setVendorId(resolvedVendorId);
    setPlates(c.plates);
    setCombos(mergedCombos);
    setVendorName(c.plates[0]?.vendorName ?? mergedCombos[0]?.vendorName ?? "");
    writeCart(resolvedVendorId, c.plates, mergedCombos);
    localStorage.removeItem(LEGACY_COMBO_CART_KEY);
  }, []);

  const subtotal = useMemo(() => {
    const plateTotal = plates.reduce((sum, p) => sum + Number(p.plateTotal), 0);
    const comboTotal = combos.reduce((sum, c) => sum + Number(c.price) * Number(c.qty), 0);
    return plateTotal + comboTotal;
  }, [plates, combos]);

  function removePlate(index: number) {
    const nextPlates = plates.filter((_, i) => i !== index);
    setPlates(nextPlates);
    const nextVendorId = nextPlates[0]?.vendorId ?? combos[0]?.vendorId ?? null;
    setVendorId(nextVendorId);
    writeCart(nextVendorId, nextPlates, combos);
    setVendorName(nextPlates[0]?.vendorName ?? combos[0]?.vendorName ?? "");
  }

  function incCombo(id: string) {
    const next = combos.map((x) => (x.comboId === id ? { ...x, qty: x.qty + 1 } : x));
    setCombos(next);
    writeCart(vendorId, plates, next);
  }

  function decCombo(id: string) {
    const next = combos
      .map((x) => (x.comboId === id ? { ...x, qty: x.qty - 1 } : x))
      .filter((x) => x.qty > 0);
    setCombos(next);
    const nextVendorId = plates[0]?.vendorId ?? next[0]?.vendorId ?? null;
    setVendorId(nextVendorId);
    writeCart(nextVendorId, plates, next);
    setVendorName(plates[0]?.vendorName ?? next[0]?.vendorName ?? "");
  }

  function clearCart() {
    setPlates([]);
    setCombos([]);
    setVendorId(null);
    setVendorName("");
    localStorage.removeItem(FOOD_CART_KEY);
    localStorage.removeItem(LEGACY_COMBO_CART_KEY);
  }

  const isEmpty = plates.length === 0 && combos.length === 0;

  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-xl font-bold sm:text-2xl">Food Cart</h1>

      {vendorName ? (
        <p className="mt-2 text-gray-600">
          Vendor: <strong>{vendorName}</strong>
        </p>
      ) : null}

      {isEmpty ? (
        <div className="mt-6 rounded border p-4">
          <p className="text-gray-600">Your cart is empty.</p>
          <button className="mt-3 rounded bg-black px-4 py-2 text-white" onClick={() => router.push("/food")}>
            Browse food
          </button>
        </div>
      ) : (
        <>
          {plates.length > 0 ? (
            <div className="mt-6 grid gap-3">
              {plates.map((p, idx) => (
                <div key={p.createdAt + idx} className="rounded border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{p.plateName}</p>
                      <p className="text-sm text-gray-600">
                        Plate total: <strong>{formatNaira(Number(p.plateTotal))}</strong>
                      </p>
                    </div>
                    <button className="rounded border px-3 py-1" onClick={() => removePlate(idx)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {combos.length > 0 ? (
            <div className="mt-6 grid gap-3">
              {combos.map((it) => (
                <div key={it.comboId} className="rounded border p-4 flex justify-between">
                  <div>
                    <p className="font-semibold">{it.name}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {formatNaira(it.price)} x {it.qty} = <strong>{formatNaira(it.price * it.qty)}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded border px-3 py-1" onClick={() => decCombo(it.comboId)}>
                      -
                    </button>
                    <span className="w-8 text-center">{it.qty}</span>
                    <button className="rounded border px-3 py-1" onClick={() => incCombo(it.comboId)}>
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-6 rounded border p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Subtotal</p>
              <p className="text-xl font-bold">{formatNaira(subtotal)}</p>
            </div>

            <div className="flex gap-2">
              <button className="rounded border px-4 py-2" onClick={clearCart}>
                Clear
              </button>
              <button className="rounded bg-black px-4 py-2 text-white" onClick={() => router.push("/food/checkout")}>
                Checkout
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
