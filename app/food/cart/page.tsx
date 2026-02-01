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
  lines: PlateLine[]; // stored, but NOT shown on cart/checkout
  createdAt: string;
};

const CART_KEY = "dashbuy_food_cart_v1";

function formatNaira(n: number) {
  return `₦${Math.round(n).toLocaleString()}`;
}

function readCart(): { vendorId: string | null; plates: CartPlate[] } {
  if (typeof window === "undefined") return { vendorId: null, plates: [] };
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return { vendorId: null, plates: [] };
    const parsed = JSON.parse(raw);
    return {
      vendorId: parsed.vendorId ?? null,
      plates: Array.isArray(parsed.plates) ? parsed.plates : [],
    };
  } catch {
    return { vendorId: null, plates: [] };
  }
}

function writeCart(vendorId: string | null, plates: CartPlate[]) {
  if (!vendorId || plates.length === 0) {
    localStorage.removeItem(CART_KEY);
    return;
  }
  localStorage.setItem(CART_KEY, JSON.stringify({ vendorId, plates }));
}

export default function FoodCartPage() {
  const router = useRouter();
  const [plates, setPlates] = useState<CartPlate[]>([]);
  const [vendorName, setVendorName] = useState<string>("");

  useEffect(() => {
    const c = readCart();
    setPlates(c.plates);
    setVendorName(c.plates[0]?.vendorName ?? "");
  }, []);

  const subtotal = useMemo(
    () => plates.reduce((sum, p) => sum + Number(p.plateTotal), 0),
    [plates]
  );

  function removePlate(index: number) {
    const next = plates.filter((_, i) => i !== index);
    setPlates(next);
    writeCart(next[0]?.vendorId ?? null, next);
    setVendorName(next[0]?.vendorName ?? "");
  }

  function clearCart() {
    setPlates([]);
    setVendorName("");
    localStorage.removeItem(CART_KEY);
  }

  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Food Cart</h1>

      {plates.length > 0 && (
        <p className="mt-2 text-gray-600">
          Vendor: <strong>{vendorName}</strong>
        </p>
      )}

      {plates.length === 0 ? (
        <div className="mt-6 rounded border p-4">
          <p className="text-gray-600">Your cart is empty.</p>
          <button
            className="mt-3 rounded bg-black px-4 py-2 text-white"
            onClick={() => router.push("/food")}
          >
            Browse vendors
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3">
            {plates.map((p, idx) => (
              <div key={p.createdAt + idx} className="rounded border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{p.plateName}</p>
                    <p className="text-sm text-gray-600">
                      Plate total: <strong>{formatNaira(Number(p.plateTotal))}</strong>
                    </p>

                    {/* IMPORTANT: plates-only UI, no item breakdown */}
                    <p className="mt-1 text-xs text-gray-500">
                      (Items are saved for the vendor, but not shown here.)
                    </p>
                  </div>

                  <button
                    className="rounded border px-3 py-1"
                    onClick={() => removePlate(idx)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded border p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Subtotal</p>
              <p className="text-xl font-bold">{formatNaira(subtotal)}</p>
            </div>

            <div className="flex gap-2">
              <button className="rounded border px-4 py-2" onClick={clearCart}>
                Clear
              </button>
              <button
                className="rounded bg-black px-4 py-2 text-white"
                onClick={() => router.push("/food/checkout")}
              >
                Checkout
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
