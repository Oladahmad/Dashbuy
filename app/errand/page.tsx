"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";

type ErrandLine = {
  name: string;
  qty: number | null;
  unitPrice: number | null;
};

type ComboCartItem = {
  comboId: string;
  name: string;
  price: number;
  qty: number;
  vendorId: string;
  vendorName: string;
};

type CartPlate = {
  vendorId: string;
  vendorName: string;
  plateTemplateId: string;
  plateName: string;
  plateFee: number;
  plateTotal: number;
  lines: Array<{ name: string; qty: number; unitPrice: number }>;
  createdAt: string;
  customRequest?: {
    restaurantName: string;
    itemsSubtotal: number;
  };
};

type FoodCart = {
  vendorId: string | null;
  plates: CartPlate[];
  combos: ComboCartItem[];
};

const FOOD_CART_KEY = "dashbuy_food_cart_v1";
const CUSTOM_VENDOR_ID = "custom_request";
const ERRAND_FEE = 200;

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function readFoodCart(): FoodCart {
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

function writeFoodCart(cart: FoodCart) {
  if (cart.plates.length === 0 && cart.combos.length === 0) {
    localStorage.removeItem(FOOD_CART_KEY);
    return;
  }
  const primaryVendorId = cart.vendorId ?? cart.plates[0]?.vendorId ?? cart.combos[0]?.vendorId ?? null;
  localStorage.setItem(FOOD_CART_KEY, JSON.stringify({ ...cart, vendorId: primaryVendorId }));
}

export default function ErrandPage() {
  const router = useRouter();

  const [sourceType, setSourceType] = useState("Restaurant");
  const [sourceName, setSourceName] = useState("");
  const [lines, setLines] = useState<ErrandLine[]>([{ name: "", qty: null, unitPrice: null }]);

  const validLines = useMemo(() => {
    return lines
      .map((line) => ({
        name: line.name.trim(),
        qty: Math.max(1, Math.floor(Number(line.qty ?? 0))),
        unitPrice: Math.max(0, Number(line.unitPrice ?? 0)),
      }))
      .filter((line) => line.name.length > 0 && line.unitPrice > 0);
  }, [lines]);

  const itemsSubtotal = useMemo(
    () => validLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0),
    [validLines],
  );

  function addLine() {
    setLines((prev) => [...prev, { name: "", qty: null, unitPrice: null }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLine(index: number, patch: Partial<ErrandLine>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addToCheckout() {
    const place = sourceName.trim();
    if (!place) {
      alert("Enter where to get this order from.");
      return;
    }

    if (validLines.length === 0) {
      alert("Add at least one item with name and price.");
      return;
    }

    const cart = readFoodCart();
    const plateName = `${sourceType} errand`;

    cart.plates.push({
      vendorId: CUSTOM_VENDOR_ID,
      vendorName: place,
      plateTemplateId: "__custom_request__",
      plateName,
      plateFee: ERRAND_FEE,
      plateTotal: itemsSubtotal + ERRAND_FEE,
      lines: validLines.map((line) => ({
        name: line.name,
        qty: line.qty,
        unitPrice: line.unitPrice,
      })),
      createdAt: new Date().toISOString(),
      customRequest: {
        restaurantName: `${sourceType}: ${place}`,
        itemsSubtotal,
      },
    });

    writeFoodCart(cart);
    router.push("/food/checkout");
  }

  return (
    <AppShell title="Errand">
      <div className="relative">
        <div className="pointer-events-none select-none blur-sm">
          <div className="rounded-2xl border bg-white p-4">
            <h1 className="text-xl font-bold sm:text-2xl">Errand request</h1>
            <p className="mt-1 text-sm text-gray-600">
              List where to buy from, then add each item and the normal price you usually pay.
            </p>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-4">
            <div className="grid gap-3">
              <div>
                <label className="text-sm font-medium">Source type</label>
                <select
                  className="mt-1 w-full rounded-xl border p-3"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value)}
                >
                  <option>Restaurant</option>
                  <option>Supermarket</option>
                  <option>Pharmacy</option>
                  <option>Store</option>
                  <option>House to house pickup</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Where to get it from</label>
                <input
                  className="mt-1 w-full rounded-xl border p-3"
                  placeholder="e.g Chicken Republic Ago / MedPlus Ago / Ebeano"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-4">
            <p className="font-semibold">Items</p>
            <div className="mt-3 space-y-3">
              {lines.map((line, idx) => (
                <div key={idx} className="rounded-xl border p-3">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-6">
                      <label className="text-xs text-gray-600">Item</label>
                      <input
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        placeholder="e.g Rice"
                        value={line.name}
                        onChange={(e) => updateLine(idx, { name: e.target.value })}
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="text-xs text-gray-600">Units</label>
                      <input
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        type="number"
                        inputMode="numeric"
                        value={line.qty ?? ""}
                        onChange={(e) =>
                          updateLine(idx, {
                            qty: e.target.value === "" ? null : Math.max(1, Math.floor(Number(e.target.value) || 0)),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="text-xs text-gray-600">Price</label>
                      <input
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        type="number"
                        inputMode="decimal"
                        value={line.unitPrice ?? ""}
                        onChange={(e) =>
                          updateLine(idx, {
                            unitPrice: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-gray-600">
                      Line total: {naira((line.qty ?? 0) * (line.unitPrice ?? 0))}
                    </p>
                    {lines.length > 1 ? (
                      <button
                        type="button"
                        className="rounded-lg border px-3 py-1 text-xs"
                        onClick={() => removeLine(idx)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="mt-3 rounded-xl border px-4 py-2 text-sm"
              onClick={addLine}
            >
              Add item
            </button>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between text-sm">
              <span>Items subtotal</span>
              <strong>{naira(itemsSubtotal)}</strong>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span>Errand fee</span>
              <strong>{naira(ERRAND_FEE)}</strong>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-semibold">Total before delivery</span>
              <strong>{naira(itemsSubtotal + ERRAND_FEE)}</strong>
            </div>

            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-white"
              onClick={addToCheckout}
            >
              Continue to checkout
            </button>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="rounded-full border bg-black px-5 py-2 text-sm font-semibold text-white">
            Feature coming soon
          </span>
        </div>
      </div>
    </AppShell>
  );
}

