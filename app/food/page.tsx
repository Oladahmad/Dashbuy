"use client";

import { useEffect, useMemo, useState } from "react";

type ComboRow = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  short_description: string | null;
  vendor_id: string;
  profiles: { store_name: string | null; full_name: string | null } | null;
};

type RestaurantRow = {
  vendor_id: string;
  name: string;
  area: string | null;
  single_count: number;
};

const FOOD_CART_KEY = "dashbuy_food_cart_v1";

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

type ComboCartItem = {
  comboId: string;
  name: string;
  price: number;
  qty: number;
  vendorId: string;
  vendorName: string;
};

type CustomFoodLine = {
  name: string;
  qty: number | null;
  unitPrice: number | null;
};

type CartPlate = {
  vendorId: string;
  vendorName: string;
  plateTemplateId: string;
  plateName: string;
  plateFee: number;
  plateTotal: number;
  lines: unknown[];
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
  const primaryVendorId =
    cart.vendorId ??
    cart.plates[0]?.vendorId ??
    cart.combos[0]?.vendorId ??
    null;
  localStorage.setItem(FOOD_CART_KEY, JSON.stringify({ ...cart, vendorId: primaryVendorId }));
}

function pickVendorName(p: { store_name: string | null; full_name: string | null } | null) {
  const s = (p?.store_name || "").trim();
  if (s) return s;
  const f = (p?.full_name || "").trim();
  if (f) return f;
  return "Vendor";
}

export default function FoodHubPage() {
  const [tab, setTab] = useState<"combos" | "restaurants" | "custom">("combos");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [q, setQ] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState<ComboRow | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  const [customLines, setCustomLines] = useState<CustomFoodLine[]>([
    { name: "", qty: null, unitPrice: null },
  ]);
  const CUSTOM_VENDOR_ID = "custom_request";
  const CUSTOM_PLATE_FEE = 200;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");
      const res = await fetch("/api/catalog/food", { cache: "no-store" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        combos?: ComboRow[];
        restaurants?: RestaurantRow[];
      };

      if (!res.ok || !body.ok) {
        setMsg(body.error ?? "Failed to load food catalog");
        setCombos([]);
        setRestaurants([]);
        setLoading(false);
        return;
      }

      setCombos(Array.isArray(body.combos) ? body.combos : []);
      setRestaurants(Array.isArray(body.restaurants) ? body.restaurants : []);
      setLoading(false);
    })();
  }, []);

  const filteredCombos = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return combos;
    return combos.filter((c) => {
      const vendorName = pickVendorName(c.profiles);
      const hay = `${c.name} ${c.short_description ?? ""} ${vendorName}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [combos, q]);

  function addComboToCart(combo: ComboRow) {
    if (!combo.vendor_id) return;
    const cart = readFoodCart();

    const vendorName = pickVendorName(combo.profiles);
    if (!cart.vendorId) cart.vendorId = combo.vendor_id;

    const existing = cart.combos.find((x) => x.comboId === combo.id);
    if (existing) existing.qty += 1;
    else {
      cart.combos.push({
        comboId: combo.id,
        name: combo.name,
        price: Number(combo.price || 0),
        qty: 1,
        vendorId: combo.vendor_id,
        vendorName,
      });
    }

    writeFoodCart(cart);
    alert("Added to cart");
  }

  function addCustomLine() {
    setCustomLines((prev) => [...prev, { name: "", qty: null, unitPrice: null }]);
  }

  function removeCustomLine(index: number) {
    setCustomLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCustomLine(index: number, patch: Partial<CustomFoodLine>) {
    setCustomLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addCustomPlateToCart() {
    const rest = restaurantName.trim();
    if (!rest) {
      alert("Enter restaurant name.");
      return;
    }

    const validLines = customLines
      .map((line) => ({
        name: line.name.trim(),
        qty: Math.max(1, Math.floor(Number(line.qty ?? 0))),
        unitPrice: Math.max(0, Number(line.unitPrice ?? 0)),
      }))
      .filter((line) => line.name.length > 0 && line.unitPrice > 0);

    if (validLines.length === 0) {
      alert("Add at least one food item with name and price.");
      return;
    }

    const itemsSubtotal = validLines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
    const plateTotal = itemsSubtotal + CUSTOM_PLATE_FEE;

    const cart = readFoodCart();
    cart.plates.push({
      vendorId: CUSTOM_VENDOR_ID,
      vendorName: rest,
      plateTemplateId: "__custom_request__",
      plateName: `${rest} plate`,
      plateFee: CUSTOM_PLATE_FEE,
      plateTotal,
      lines: validLines.map((line) => ({
        name: line.name,
        qty: line.qty,
        unitPrice: line.unitPrice,
      })),
      createdAt: new Date().toISOString(),
      customRequest: {
        restaurantName: rest,
        itemsSubtotal,
      },
    });

    writeFoodCart(cart);
    setRestaurantName("");
    setCustomLines([{ name: "", qty: null, unitPrice: null }]);
    alert("Custom plate added to cart.");
  }

  if (loading) return <main className="p-6">Loading...</main>;
  const detailsVendorName = selectedCombo ? pickVendorName(selectedCombo.profiles) : "Vendor";

  return (
    <main className="p-4 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold sm:text-2xl">Food</h1>

      <div className="mt-4 flex gap-2">
        <button
          className={`flex-1 rounded-xl border px-4 py-3 text-sm ${tab === "combos" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setTab("combos")}
          type="button"
        >
          Combos
        </button>
        <button
          className={`flex-1 rounded-xl border px-4 py-3 text-sm ${tab === "restaurants" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setTab("restaurants")}
          type="button"
        >
          Restaurants
        </button>
        <button
          className={`flex-1 rounded-xl border px-4 py-3 text-sm ${tab === "custom" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setTab("custom")}
          type="button"
        >
          Custom Plate
        </button>
      </div>

      {msg ? <p className="mt-3 text-sm text-red-600">{msg}</p> : null}

      {tab === "combos" ? (
        <>
          <div className="mt-4">
            <input
              className="w-full rounded-xl border p-3"
              placeholder="Search combos..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filteredCombos.map((c) => {
              const vendorName = pickVendorName(c.profiles);
              return (
                <div key={c.id} className="rounded-2xl border bg-white overflow-hidden">
                  <button type="button" className="w-full text-left" onClick={() => { setSelectedCombo(c); setDetailsOpen(true); }}>
                    <div className="aspect-[4/3] bg-gray-100">
                      {c.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.image_url} alt={c.name} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-sm">{c.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{vendorName}</p>
                      <p className="mt-2 font-bold text-sm">{naira(Number(c.price ?? 0))}</p>
                      {c.short_description ? <p className="mt-1 text-xs text-gray-600 line-clamp-2">{c.short_description}</p> : null}
                    </div>
                  </button>
                  <div className="px-3 pb-3">
                    <button className="w-full rounded-xl bg-black px-3 py-2 text-white text-sm" onClick={() => addComboToCart(c)} type="button">
                      Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : tab === "restaurants" ? (
        <div className="mt-4 grid gap-3">
          {restaurants.map((r) => (
            <a key={r.vendor_id} href={`/food/vendors/${r.vendor_id}`} className="rounded-2xl border bg-white p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-gray-500">{r.area ?? "Ago"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{r.single_count}</p>
                <p className="text-xs text-gray-500">single foods</p>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <section className="mt-4 rounded-2xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Custom restaurant request</h2>
          <p className="mt-1 text-sm text-gray-600">
            Enter restaurant name, list the foods you want, set units and the normal restaurant price.
          </p>

          <div className="mt-4">
            <label className="text-sm font-medium">Restaurant name</label>
            <input
              className="mt-1 w-full rounded-xl border p-3"
              placeholder="e.g. Mama Put Ago"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
            />
          </div>

          <div className="mt-4 space-y-3">
            {customLines.map((line, idx) => (
              <div key={idx} className="rounded-xl border p-3">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6">
                    <label className="text-xs text-gray-600">Food</label>
                    <input
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                      placeholder="e.g Rice"
                      value={line.name}
                      onChange={(e) => updateCustomLine(idx, { name: e.target.value })}
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
                        updateCustomLine(idx, {
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
                        updateCustomLine(idx, {
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
                  {customLines.length > 1 ? (
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1 text-xs"
                      onClick={() => removeCustomLine(idx)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={addCustomLine}>
              Add food
            </button>
            <button
              type="button"
              className="rounded-xl bg-black px-4 py-2 text-sm text-white"
              onClick={addCustomPlateToCart}
            >
              Add to food cart (plate fee {naira(CUSTOM_PLATE_FEE)})
            </button>
          </div>
        </section>
      )}

      {detailsOpen && selectedCombo ? (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={() => { setDetailsOpen(false); setSelectedCombo(null); }} role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-white overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <div className="min-w-0">
                <p className="text-xs text-gray-600">Combo details</p>
                <p className="text-base font-semibold truncate">{selectedCombo.name}</p>
              </div>
            </div>

            <div className="aspect-[4/3] bg-gray-100">
              {selectedCombo.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedCombo.image_url} alt={selectedCombo.name} className="h-full w-full object-cover" />
              ) : null}
            </div>

            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-600">{detailsVendorName}</p>
                <p className="text-lg font-bold">{naira(Number(selectedCombo.price ?? 0))}</p>
              </div>
              {selectedCombo.short_description ? <p className="text-sm text-gray-700">{selectedCombo.short_description}</p> : <p className="text-sm text-gray-500">No description yet.</p>}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  className="min-w-20 rounded-xl border px-4 py-3 text-sm"
                  onClick={() => {
                    setDetailsOpen(false);
                    setSelectedCombo(null);
                  }}
                >
                  Back
                </button>
                <button type="button" className="flex-1 rounded-xl bg-black px-4 py-3 text-white text-sm" onClick={() => addComboToCart(selectedCombo)}>
                  Add to cart
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
