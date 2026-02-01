"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type Vendor = { id: string; name: string };
type Plate = { id: string; name: string; plate_fee: number };

type FoodItem = {
  id: string;
  vendor_id: string;
  name: string;
  category: string;
  pricing_type: "fixed" | "per_scoop" | "per_unit" | "variant";
  price: number;
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
  // We store breakdown for vendor/order creation later,
  // but we won't show it on checkout (plates-only UI).
  lines: PlateLine[];
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

function writeCart(vendorId: string, plates: CartPlate[]) {
  localStorage.setItem(CART_KEY, JSON.stringify({ vendorId, plates }));
}

export default function BuildPlatePage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const plateId = searchParams.get("plateId");

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [plate, setPlate] = useState<Plate | null>(null);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [msg, setMsg] = useState("Loading...");

  // selection state:
  // key = foodItemId, value = { qty, variantId? }
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [variantById, setVariantById] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      if (!plateId) {
        setMsg("Missing plateId. Go back and choose a plate.");
        return;
      }

      // vendor
      const { data: v, error: vErr } = await supabase
        .from("vendors")
        .select("id,name")
        .eq("id", vendorId)
        .single();
      if (vErr || !v) {
        setMsg("Vendor not found");
        return;
      }
      setVendor(v);

      // plate
      const { data: p, error: pErr } = await supabase
        .from("plate_templates")
        .select("id,name,plate_fee")
        .eq("id", plateId)
        .eq("vendor_id", vendorId)
        .single();

      if (pErr || !p) {
        setMsg("Plate not found for this vendor");
        return;
      }
      setPlate(p);

      // items
      const { data: it, error: itErr } = await supabase
        .from("food_items")
        .select("id,vendor_id,name,category,pricing_type,price,unit_label,is_available")
        .eq("vendor_id", vendorId)
        .eq("is_available", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (itErr) {
        setMsg("Error loading menu: " + itErr.message);
        return;
      }
      setItems(it ?? []);

      // variants (only for items that are variant pricing)
      const variantItemIds = (it ?? [])
        .filter((x) => x.pricing_type === "variant")
        .map((x) => x.id);

      if (variantItemIds.length > 0) {
        const { data: va, error: vaErr } = await supabase
          .from("food_item_variants")
          .select("id,food_item_id,name,price,is_available")
          .in("food_item_id", variantItemIds)
          .eq("is_available", true)
          .order("price", { ascending: true });

        if (vaErr) {
          setMsg("Error loading variants: " + vaErr.message);
          return;
        }

        setVariants(va ?? []);

        // default select cheapest variant for each variant item
        const byFood: Record<string, Variant[]> = {};
        for (const v of va ?? []) {
          if (!byFood[v.food_item_id]) byFood[v.food_item_id] = [];
          byFood[v.food_item_id].push(v);
        }
        const defaults: Record<string, string> = {};
        for (const fid of Object.keys(byFood)) {
          defaults[fid] = byFood[fid][0]?.id;
        }
        setVariantById(defaults);
      }

      setMsg("");
    })();
  }, [vendorId, plateId]);

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
        if (!selected) continue; // no available variants

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
          unitPrice: Number(it.price),
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
    if (!vendor || !plate || !plateId) return;

    if (lines.length === 0) {
      setMsg("Select at least one item to continue.");
      return;
    }

    const existing = readCart();

    // enforce single-vendor cart for v1 (simple, reduces headaches)
    let nextPlates = existing.plates;
    if (existing.vendorId && existing.vendorId !== vendor.id) {
      // replace cart if vendor changes
      nextPlates = [];
    }

    const newPlate: CartPlate = {
      vendorId: vendor.id,
      vendorName: vendor.name,
      plateTemplateId: plate.id,
      plateName: plate.name,
      plateFee,
      plateTotal,
      lines,
      createdAt: new Date().toISOString(),
    };

    writeCart(vendor.id, [...nextPlates, newPlate]);

    router.push("/food/cart");
  }

  if (msg) return <main className="p-6">{msg}</main>;

  return (
    <main className="p-6 max-w-4xl">
      <button className="text-sm underline" onClick={() => router.back()}>
        ← Back
      </button>

      <h1 className="mt-3 text-2xl font-bold">
        Build Plate — {vendor?.name}
      </h1>

      <div className="mt-3 rounded border p-4">
        <p className="font-semibold">{plate?.name}</p>
        <p className="text-sm text-gray-600">
          Plate fee: {formatNaira(plateFee)}
        </p>
        <p className="mt-2 text-sm">
          Items total: <strong>{formatNaira(itemsTotal)}</strong> • Plate total:{" "}
          <strong>{formatNaira(plateTotal)}</strong>
        </p>
      </div>

      <div className="mt-6 grid gap-6">
        {Object.entries(itemsByCategory).map(([cat, catItems]) => (
          <section key={cat} className="rounded border p-4">
            <h2 className="font-semibold capitalize">{cat}</h2>

            <div className="mt-3 grid gap-3">
              {catItems.map((it) => {
                const qty = qtyById[it.id] ?? 0;
                const isVariant = it.pricing_type === "variant";
                const vOptions = variantsByFoodId[it.id] ?? [];
                const selectedVariantId = variantById[it.id] ?? (vOptions[0]?.id ?? "");
                const selectedVariant =
                  vOptions.find((x) => x.id === selectedVariantId) ?? vOptions[0];

                const displayPrice =
                  it.pricing_type === "variant"
                    ? selectedVariant
                      ? `${selectedVariant.name} • ${formatNaira(Number(selectedVariant.price))}`
                      : "No variants available"
                    : `${formatNaira(Number(it.price))}${it.unit_label ? ` / ${it.unit_label}` : ""}`;

                return (
                  <div key={it.id} className="rounded border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{it.name}</p>
                        <p className="text-sm text-gray-600">
                          {it.pricing_type} • {displayPrice}
                        </p>

                        {isVariant && (
                          <div className="mt-2">
                            <label className="text-xs text-gray-600">Select option</label>
                            <select
                              className="mt-1 w-full rounded border p-2"
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
                                    {v.name} — {formatNaira(Number(v.price))}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className="rounded border px-3 py-1"
                          onClick={() => setQty(it.id, qty - 1)}
                        >
                          -
                        </button>
                        <span className="w-8 text-center">{qty}</span>
                        <button
                          className="rounded border px-3 py-1"
                          onClick={() => setQty(it.id, qty + 1)}
                          disabled={isVariant && vOptions.length === 0}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {qty > 0 && (
                      <p className="mt-2 text-sm">
                        Line total:{" "}
                        <strong>
                          {formatNaira(
                            qty *
                              (it.pricing_type === "variant"
                                ? Number(selectedVariant?.price ?? 0)
                                : Number(it.price))
                          )}
                        </strong>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between rounded border p-4">
        <div>
          <p className="text-sm text-gray-600">Plate total</p>
          <p className="text-xl font-bold">{formatNaira(plateTotal)}</p>
        </div>

        <button
          className="rounded bg-black px-4 py-2 text-white"
          onClick={addToCart}
        >
          Add plate to cart
        </button>
      </div>
    </main>
  );
}
