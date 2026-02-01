"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

const COMBO_CART_KEY = "dashbuy_combo_cart_v1";

function naira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

type ComboCartItem = {
  comboId: string;
  name: string;
  price: number;
  qty: number;
  vendorId: string;
  vendorName: string;
};

type ComboCart = {
  vendorId: string | null;
  vendorName: string | null;
  items: ComboCartItem[];
};

function readComboCart(): ComboCart {
  if (typeof window === "undefined") return { vendorId: null, vendorName: null, items: [] };
  try {
    const raw = localStorage.getItem(COMBO_CART_KEY);
    return raw ? (JSON.parse(raw) as ComboCart) : { vendorId: null, vendorName: null, items: [] };
  } catch {
    return { vendorId: null, vendorName: null, items: [] };
  }
}

function writeComboCart(cart: ComboCart) {
  localStorage.setItem(COMBO_CART_KEY, JSON.stringify(cart));
}

function pickVendorName(p: { store_name: string | null; full_name: string | null } | null) {
  const s = (p?.store_name || "").trim();
  if (s) return s;
  const f = (p?.full_name || "").trim();
  if (f) return f;
  return "Vendor";
}

export default function FoodHubPage() {
  const [tab, setTab] = useState<"combos" | "restaurants">("combos");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);

  const [q, setQ] = useState("");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedCombo, setSelectedCombo] = useState<ComboRow | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const { data: c, error: cErr } = await supabase
        .from("food_items")
        .select("id,name,price,image_url,short_description,vendor_id,profiles(store_name,full_name)")
        .eq("food_type", "combo")
        .eq("is_available", true)
        .order("created_at", { ascending: false });

      if (cErr) setMsg("Combos error: " + cErr.message);
      setCombos(Array.isArray(c) ? (c as unknown as ComboRow[]) : []);

      const { data: singles, error: sErr } = await supabase
        .from("food_items")
        .select("vendor_id")
        .eq("food_type", "single")
        .eq("is_available", true);

      if (sErr) {
        setMsg((prev) => prev || "Restaurants error: " + sErr.message);
        setRestaurants([]);
        setLoading(false);
        return;
      }

      const counts = new Map<string, number>();
      (singles || []).forEach((row: { vendor_id: string }) => {
        const vid = row.vendor_id;
        counts.set(vid, (counts.get(vid) || 0) + 1);
      });

      const vendorIds = Array.from(counts.keys());

      if (vendorIds.length === 0) {
        setRestaurants([]);
        setLoading(false);
        return;
      }

      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id,store_name,full_name,store_address,address")
        .in("id", vendorIds);

      if (pErr) {
        setMsg((prev) => prev || "Restaurants error: " + pErr.message);
        setRestaurants([]);
        setLoading(false);
        return;
      }

      const rows: RestaurantRow[] = (profs || []).map((p: Record<string, unknown>) => {
        const id = String(p.id || "");
        const storeName = String(p.store_name || "").trim();
        const fullName = String(p.full_name || "").trim();
        const storeAddress = String(p.store_address || "").trim();
        const address = String(p.address || "").trim();

        const name = storeName || fullName || "Vendor";
        const area = storeAddress || address || null;

        return {
          vendor_id: id,
          name,
          area,
          single_count: counts.get(id) || 0,
        };
      });

      rows.sort((a, b) => a.name.localeCompare(b.name));
      setRestaurants(rows);

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

  function openComboDetails(combo: ComboRow) {
    setSelectedCombo(combo);
    setDetailsOpen(true);
  }

  function closeDetails() {
    setDetailsOpen(false);
    setSelectedCombo(null);
  }

  function addComboToCart(combo: ComboRow) {
    if (!combo.vendor_id) return;

    const cart = readComboCart();

    if (cart.vendorId && cart.vendorId !== combo.vendor_id) {
      cart.vendorId = null;
      cart.vendorName = null;
      cart.items = [];
    }

    const vendorName = pickVendorName(combo.profiles);

    cart.vendorId = combo.vendor_id;
    cart.vendorName = vendorName;

    const existing = cart.items.find((x) => x.comboId === combo.id);
    if (existing) existing.qty += 1;
    else {
      cart.items.push({
        comboId: combo.id,
        name: combo.name,
        price: Number(combo.price || 0),
        qty: 1,
        vendorId: combo.vendor_id,
        vendorName,
      });
    }

    writeComboCart(cart);
    alert("Added to cart ✅");
  }

  if (loading) return <main className="p-6">Loading...</main>;

  const detailsVendorName = selectedCombo ? pickVendorName(selectedCombo.profiles) : "Vendor";

  return (
    <main className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold">Food</h1>

      <div className="mt-4 flex gap-2">
        <button
          className={`flex-1 rounded-xl border px-4 py-3 text-sm ${
            tab === "combos" ? "bg-black text-white" : "bg-white"
          }`}
          onClick={() => setTab("combos")}
          type="button"
        >
          Combos
        </button>
        <button
          className={`flex-1 rounded-xl border px-4 py-3 text-sm ${
            tab === "restaurants" ? "bg-black text-white" : "bg-white"
          }`}
          onClick={() => setTab("restaurants")}
          type="button"
        >
          Restaurants
        </button>
      </div>

      {msg ? <p className="mt-3 text-sm text-red-600">{msg}</p> : null}

      {tab === "combos" ? (
        <>
          <div className="mt-4 flex items-center justify-between gap-3">
            <input
              className="w-full rounded-xl border p-3"
              placeholder="Search combos..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <a className="rounded-xl border px-4 py-3 text-sm bg-white" href="/food/combos/cart">
              Cart
            </a>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filteredCombos.map((c) => {
              const vendorName = pickVendorName(c.profiles);

              return (
                <div
                  key={c.id}
                  className="rounded-2xl border bg-white overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => openComboDetails(c)}
                  >
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

                      {c.short_description ? (
                        <p className="mt-1 text-xs text-gray-600 line-clamp-2">
                          {c.short_description}
                        </p>
                      ) : null}

                      <p className="mt-2 text-xs text-gray-500">Tap for full details</p>
                    </div>
                  </button>

                  <div className="px-3 pb-3">
                    <button
                      className="w-full rounded-xl bg-black px-3 py-2 text-white text-sm"
                      onClick={() => addComboToCart(c)}
                      type="button"
                    >
                      Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-4 grid gap-3">
          {restaurants.map((r) => (
            <a
              key={r.vendor_id}
              href={`/food/vendors/${r.vendor_id}`}
              className="rounded-2xl border bg-white p-4 flex items-center justify-between"
            >
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
      )}

      {detailsOpen && selectedCombo ? (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3"
          onClick={closeDetails}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div className="min-w-0">
                <p className="text-xs text-gray-600">Combo details</p>
                <p className="text-base font-semibold truncate">{selectedCombo.name}</p>
              </div>

              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-sm"
                onClick={closeDetails}
              >
                Close
              </button>
            </div>

            <div className="aspect-[4/3] bg-gray-100">
              {selectedCombo.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedCombo.image_url}
                  alt={selectedCombo.name}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>

            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-600">{detailsVendorName}</p>
                <p className="text-lg font-bold">{naira(Number(selectedCombo.price ?? 0))}</p>
              </div>

              {selectedCombo.short_description ? (
                <p className="text-sm text-gray-700">{selectedCombo.short_description}</p>
              ) : (
                <p className="text-sm text-gray-500">No description yet.</p>
              )}

              <div className="pt-2 grid gap-2">
                <button
                  type="button"
                  className="w-full rounded-xl bg-black px-4 py-3 text-white text-sm"
                  onClick={() => addComboToCart(selectedCombo)}
                >
                  Add to cart
                </button>

                <a
                  className="w-full rounded-xl border px-4 py-3 text-center text-sm"
                  href="/food/combos/cart"
                >
                  Go to cart
                </a>
              </div>

              <p className="text-xs text-gray-500">
                This popup stays on the same page and you can close it anytime.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
