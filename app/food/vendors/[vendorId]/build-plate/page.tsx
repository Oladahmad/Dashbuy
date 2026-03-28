"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type Vendor = {
  id: string;
  store_name: string | null;
  full_name: string | null;
};

type Plate = { id: string; name: string; plate_fee: number };

type FoodItem = {
  id: string;
  name: string;
  category: string;
  pricing_type: "fixed" | "per_scoop" | "per_unit" | "variant";
  price: number;
  unit_price?: number | null;
  unit_label: string | null;
  is_available: boolean;
};

type Variant = {
  id: string;
  food_item_id: string;
  name: string;
  price: number;
  is_available: boolean;
};

type PlateLine = {
  foodItemId: string;
  name: string;
  category: string;
  pricingType: FoodItem["pricing_type"];
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

const CART_KEY = "dashbuy_food_cart_v1";

function vendorDisplayName(v: Vendor | null) {
  const store = (v?.store_name || "").trim();
  if (store) return store;
  const full = (v?.full_name || "").trim();
  if (full) return full;
  return "Vendor";
}

function formatNaira(n: number) {
  return `N${Math.round(n).toLocaleString()}`;
}

function itemUnitPrice(it: FoodItem) {
  if (it.pricing_type === "per_scoop" || it.pricing_type === "per_unit") {
    return Number(it.unit_price ?? 0);
  }
  return Number(it.price ?? 0);
}

function readCart(): FoodCart {
  if (typeof window === "undefined") return { vendorId: null, plates: [], combos: [] };
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return { vendorId: null, plates: [], combos: [] };
    const parsed = JSON.parse(raw) as Partial<FoodCart>;
    const plates = Array.isArray(parsed.plates) ? parsed.plates : [];
    const combos = Array.isArray(parsed.combos) ? parsed.combos : [];
    return {
      vendorId: parsed.vendorId ?? plates[0]?.vendorId ?? combos[0]?.vendorId ?? null,
      plates,
      combos,
    };
  } catch {
    return { vendorId: null, plates: [], combos: [] };
  }
}

function writeCart(cart: FoodCart) {
  if (cart.plates.length === 0 && cart.combos.length === 0) {
    localStorage.removeItem(CART_KEY);
    return;
  }
  const vendorId = cart.vendorId ?? cart.plates[0]?.vendorId ?? cart.combos[0]?.vendorId ?? null;
  localStorage.setItem(CART_KEY, JSON.stringify({ ...cart, vendorId }));
}

function BuildPlatePageInner() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const plateId = searchParams.get("plateId");
  const editAt = searchParams.get("editAt");

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [plate, setPlate] = useState<Plate | null>(null);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [msg, setMsg] = useState("Loading...");
  const [editingPlateAt, setEditingPlateAt] = useState<string | null>(null);

  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [variantById, setVariantById] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      if (!vendorId) {
        setMsg("Vendor not found");
        return;
      }

      const res = await fetch(`/api/catalog/food/vendor/${vendorId}`, { cache: "no-store" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        vendor?: Vendor | null;
        plates?: Plate[];
        items?: FoodItem[];
        variants?: Variant[];
      };

      if (!res.ok || !body.ok || !body.vendor) {
        setMsg(body.error ?? "Vendor not found");
        return;
      }

      setVendor(body.vendor);
      const loadedPlates = Array.isArray(body.plates) ? body.plates : [];
      const loadedItems = Array.isArray(body.items) ? body.items : [];
      const loadedVariants = Array.isArray(body.variants) ? body.variants : [];
      setItems(loadedItems);
      setVariants(loadedVariants);

      if (loadedPlates.length === 0) {
        setMsg("No plate template available yet.");
        return;
      }

      let effectivePlateId = plateId;
      if (!effectivePlateId) {
        effectivePlateId = loadedPlates[0].id;
        router.replace(`/food/vendors/${vendorId}/build-plate?plateId=${effectivePlateId}`);
      }

      const selectedPlate = loadedPlates.find((p) => p.id === effectivePlateId) ?? null;
      if (!selectedPlate) {
        setMsg("Plate not found for this vendor");
        return;
      }
      setPlate(selectedPlate);

      const byFood: Record<string, Variant[]> = {};
      for (const v of loadedVariants) {
        if (!byFood[v.food_item_id]) byFood[v.food_item_id] = [];
        byFood[v.food_item_id].push(v);
      }
      const defaults: Record<string, string> = {};
      for (const fid of Object.keys(byFood)) {
        defaults[fid] = byFood[fid][0]?.id;
      }

      if (editAt) {
        const existing = readCart();
        const target = existing.plates.find(
          (p) =>
            p.createdAt === editAt &&
            p.vendorId === vendorId &&
            p.plateTemplateId === selectedPlate.id,
        );

        if (target) {
          const nextQty: Record<string, number> = {};
          const nextVariant: Record<string, string> = { ...defaults };

          for (const line of target.lines) {
            if (!line.foodItemId) continue;
            nextQty[line.foodItemId] = Number(line.qty) || 0;
            if (line.variantId) nextVariant[line.foodItemId] = line.variantId;
          }

          setQtyById(nextQty);
          setVariantById(nextVariant);
          setEditingPlateAt(target.createdAt);
        } else {
          setQtyById({});
          setVariantById(defaults);
          setEditingPlateAt(null);
        }
      } else {
        setQtyById({});
        setVariantById(defaults);
        setEditingPlateAt(null);
      }

      setMsg("");
    })();
  }, [vendorId, plateId, editAt, router]);

  const variantsByFoodId = useMemo(() => {
    const map: Record<string, Variant[]> = {};
    for (const v of variants) {
      if (!map[v.food_item_id]) map[v.food_item_id] = [];
      map[v.food_item_id].push(v);
    }
    return map;
  }, [variants]);

  const itemsByCategory = useMemo(() => {
    const map: Record<string, FoodItem[]> = {};
    for (const it of items) {
      if (!map[it.category]) map[it.category] = [];
      map[it.category].push(it);
    }
    return map;
  }, [items]);

  const lines: PlateLine[] = useMemo(() => {
    const res: PlateLine[] = [];

    for (const it of items) {
      const qty = qtyById[it.id] ?? 0;
      if (qty <= 0) continue;

      if (it.pricing_type === "variant") {
        const selectedVariantId = variantById[it.id];
        const options = variantsByFoodId[it.id] ?? [];
        const selected = options.find((x) => x.id === selectedVariantId) ?? options[0];
        if (!selected) continue;

        res.push({
          foodItemId: it.id,
          name: it.name,
          category: it.category,
          pricingType: it.pricing_type,
          qty,
          unitPrice: Number(selected.price),
          variantId: selected.id,
          variantName: selected.name,
        });
      } else {
        res.push({
          foodItemId: it.id,
          name: it.name,
          category: it.category,
          pricingType: it.pricing_type,
          qty,
          unitPrice: itemUnitPrice(it),
          unitLabel: it.unit_label,
        });
      }
    }

    return res;
  }, [items, qtyById, variantById, variantsByFoodId]);

  const plateFee = Number(plate?.plate_fee ?? 0);

  const itemsTotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  }, [lines]);

  const plateTotal = plateFee + itemsTotal;

  function setQty(foodItemId: string, newQty: number) {
    setQtyById((prev) => ({ ...prev, [foodItemId]: Math.max(0, newQty) }));
  }

  function addToCart() {
    if (!vendor || !plate) return;

    if (lines.length === 0) {
      setMsg("Select at least one item to continue.");
      return;
    }

    const existing = readCart();

    const newPlate: CartPlate = {
      vendorId: vendor.id,
      vendorName: vendorDisplayName(vendor),
      plateTemplateId: plate.id,
      plateName: plate.name,
      plateFee,
      plateTotal,
      lines,
      createdAt: editingPlateAt ?? new Date().toISOString(),
    };

    const nextPlates = editingPlateAt
      ? existing.plates.map((p) => (p.createdAt === editingPlateAt ? newPlate : p))
      : [...existing.plates, newPlate];

    writeCart({
      vendorId: existing.vendorId ?? vendor.id,
      plates: nextPlates,
      combos: existing.combos,
    });

    router.push("/food/cart");
  }

  if (msg) return <main className="p-6">{msg}</main>;

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <button
        type="button"
        className="rounded-xl border px-3 py-2 text-sm"
        onClick={() => router.back()}
      >
        Back
      </button>

      <section className="rounded-2xl border bg-white p-4">
        <h1 className="text-xl font-bold sm:text-2xl">Build Plate</h1>
        <p className="mt-1 text-sm text-gray-600">{vendorDisplayName(vendor)}</p>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Selected plate</p>
            <p className="mt-1 font-semibold">{plate?.name}</p>
            <p className="mt-1 text-sm text-gray-600">Fee: {formatNaira(plateFee)}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-xs text-gray-600">Items total</p>
            <p className="mt-1 font-semibold">{formatNaira(itemsTotal)}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4">
        {Object.entries(itemsByCategory).map(([cat, catItems]) => (
          <section key={cat} className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold capitalize">{cat}</h2>
              <p className="text-xs text-gray-500">{catItems.length} items</p>
            </div>

            <div className="mt-3 grid gap-3">
              {catItems.map((it) => {
                const qty = qtyById[it.id] ?? 0;
                const isVariant = it.pricing_type === "variant";
                const vOptions = variantsByFoodId[it.id] ?? [];
                const selectedVariantId = variantById[it.id] ?? (vOptions[0]?.id ?? "");
                const selectedVariant = vOptions.find((x) => x.id === selectedVariantId) ?? vOptions[0];

                const displayPrice =
                  it.pricing_type === "variant"
                    ? selectedVariant
                      ? `${selectedVariant.name} - ${formatNaira(Number(selectedVariant.price))}`
                      : "No variants available"
                    : `${formatNaira(itemUnitPrice(it))}${it.unit_label ? ` / ${it.unit_label}` : ""}`;

                return (
                  <div key={it.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{it.name}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          {it.pricing_type} - {displayPrice}
                        </p>

                        {isVariant ? (
                          <div className="mt-2">
                            <label className="text-xs text-gray-600">Select option</label>
                            <select
                              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                              value={selectedVariantId}
                              onChange={(e) =>
                                setVariantById((prev) => ({
                                  ...prev,
                                  [it.id]: e.target.value,
                                }))
                              }
                              disabled={vOptions.length === 0}
                            >
                              {vOptions.length === 0 ? (
                                <option value="">No variants</option>
                              ) : (
                                vOptions.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name} - {formatNaira(Number(v.price))}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg border px-3 py-1"
                          onClick={() => setQty(it.id, qty - 1)}
                        >
                          -
                        </button>
                        <span className="w-8 text-center">{qty}</span>
                        <button
                          type="button"
                          className="rounded-lg border px-3 py-1"
                          onClick={() => setQty(it.id, qty + 1)}
                          disabled={isVariant && vOptions.length === 0}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {qty > 0 ? (
                      <p className="mt-2 text-sm">
                        Line total: <strong>{formatNaira(qty * (it.pricing_type === "variant" ? Number(selectedVariant?.price ?? 0) : itemUnitPrice(it)))}</strong>
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-600">Plate total</p>
            <p className="text-xl font-bold">{formatNaira(plateTotal)}</p>
          </div>

          <button
            type="button"
            className="rounded-xl bg-black px-4 py-3 text-sm text-white"
            onClick={addToCart}
          >
            {editingPlateAt ? "Update plate in cart" : "Add plate to cart"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default function BuildPlatePage() {
  return (
    <Suspense fallback={<main className="p-6">Loading...</main>}>
      <BuildPlatePageInner />
    </Suspense>
  );
}
