"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams } from "next/navigation";

type VendorProfile = {
  id: string;
  store_name: string | null;
  full_name: string | null;
  store_address: string | null;
  address: string;
  phone: string;
  logo_url: string | null;
};

type Plate = {
  id: string;
  name: string;
  plate_fee: number;
  is_active: boolean;
};

type FoodItem = {
  id: string;
  name: string;
  category: string;
  pricing_type: string;
  price: number;
  unit_label: string | null;
  unit_price: number | null;
  short_description: string | null;
  image_url: string | null;
  min_qty: number | null;
  max_qty: number | null;
  stock_qty: number | null;
  is_available: boolean;
};

type VariantRow = {
  id: string;
  food_item_id: string;
  name: string;
  price: number;
  is_available: boolean;
  sort_order: number | null;
};

function naira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

function cap(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function vendorName(v: VendorProfile | null) {
  const store = (v?.store_name || "").trim();
  if (store) return store;
  const full = (v?.full_name || "").trim();
  if (full) return full;
  return "Vendor";
}

function vendorArea(v: VendorProfile | null) {
  const storeAddr = (v?.store_address || "").trim();
  if (storeAddr) return storeAddr;
  const addr = (v?.address || "").trim();
  if (addr) return addr;
  return "Ago";
}

export default function VendorMenuPage() {
  const { vendorId } = useParams<{ vendorId: string }>();

  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [plates, setPlates] = useState<Plate[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [msg, setMsg] = useState("Loading...");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [detailsErr, setDetailsErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setMsg("Loading...");

      if (!vendorId) {
        setMsg("Vendor not found");
        return;
      }

      const res = await fetch(`/api/catalog/food/vendor/${vendorId}`, { cache: "no-store" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        vendor?: VendorProfile | null;
        plates?: Plate[];
        items?: FoodItem[];
      };

      if (!res.ok || !body.ok || !body.vendor) {
        setVendor(null);
        setPlates([]);
        setItems([]);
        setMsg(body.error ?? "Vendor not found");
        return;
      }

      setVendor(body.vendor);
      setPlates(Array.isArray(body.plates) ? body.plates : []);
      setItems(Array.isArray(body.items) ? body.items : []);
      setMsg("");
    })();
  }, [vendorId]);

  const itemsByCategory = useMemo(() => {
    const map: Record<string, FoodItem[]> = {};
    for (const it of items) {
      const cat = it.category || "main";
      if (!map[cat]) map[cat] = [];
      map[cat].push(it);
    }
    return map;
  }, [items]);

  function closeDetails() {
    setDetailsOpen(false);
    setSelectedItem(null);
    setVariants([]);
    setVariantsLoading(false);
    setDetailsErr(null);
  }

  async function openFoodDetails(it: FoodItem) {
    setSelectedItem(it);
    setDetailsOpen(true);
    setVariants([]);
    setDetailsErr(null);

    if (it.pricing_type !== "variant") return;

    setVariantsLoading(true);
    const { data: v, error: vErr } = await supabase
      .from("food_item_variants")
      .select("id,food_item_id,name,price,is_available,sort_order")
      .eq("food_item_id", it.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (vErr) {
      setVariantsLoading(false);
      setDetailsErr("Variants error: " + vErr.message);
      return;
    }

    setVariantsLoading(false);
    setVariants((v as VariantRow[]) ?? []);
  }

  if (msg) return <main className="p-6">{msg}</main>;

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate sm:text-2xl">{vendorName(vendor)}</h1>
          <p className="mt-1 text-sm text-gray-600">{vendorArea(vendor)}</p>
        </div>

        {vendor?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.logo_url}
            alt={vendorName(vendor)}
            className="h-12 w-12 rounded-xl object-cover border"
          />
        ) : null}
      </div>

      <section className="mt-6">
        <h2 className="font-semibold">Choose a plate</h2>

        {plates.length === 0 ? (
          <p className="mt-2 text-gray-600">No plates available for this vendor yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {plates.map((p) => (
              <a
                key={p.id}
                href={`/food/vendors/${vendorId}/build-plate?plateId=${p.id}`}
                className="rounded-2xl border p-4 hover:bg-gray-50"
              >
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-gray-600">Plate fee: {naira(Number(p.plate_fee || 0))}</p>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">Menu</h2>

        {items.length === 0 ? (
          <p className="mt-2 text-gray-600">No menu items yet.</p>
        ) : (
          <div className="mt-4 grid gap-6">
            {Object.entries(itemsByCategory).map(([cat, catItems]) => (
              <div key={cat} className="rounded-2xl border p-4 bg-white">
                <p className="font-semibold capitalize">{cap(cat)}</p>

                <div className="mt-3 grid gap-2">
                  {catItems.map((it) => {
                    const subtitle =
                      it.pricing_type === "variant"
                        ? "Tap to view variants"
                        : it.unit_price && it.unit_price > 0
                        ? `${naira(Number(it.unit_price))}${it.unit_label ? ` / ${it.unit_label}` : ""}`
                        : `${naira(Number(it.price || 0))}${it.unit_label ? ` / ${it.unit_label}` : ""}`;

                    return (
                      <button
                        key={it.id}
                        type="button"
                        className="w-full rounded-2xl border p-3 text-left hover:bg-gray-50"
                        onClick={() => openFoodDetails(it)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{it.name}</p>
                            <p className="text-xs text-gray-600 mt-1">{subtitle}</p>
                          </div>

                          {it.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={it.image_url}
                              alt={it.name}
                              className="h-12 w-12 rounded-xl object-cover border shrink-0"
                            />
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {detailsOpen && selectedItem ? (
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
                <p className="text-xs text-gray-600">{vendorName(vendor)}</p>
                <p className="text-base font-semibold truncate">{selectedItem.name}</p>
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
              {selectedItem.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedItem.image_url}
                  alt={selectedItem.name}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>

            <div className="p-4 space-y-3">
              {selectedItem.short_description ? (
                <p className="text-sm text-gray-700">{selectedItem.short_description}</p>
              ) : (
                <p className="text-sm text-gray-500">No description yet.</p>
              )}

              <div className="rounded-2xl border p-3 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-600">Category</p>
                  <p className="text-sm font-medium">{cap(selectedItem.category || "main")}</p>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-600">Pricing</p>
                  <p className="text-sm font-medium">{cap(selectedItem.pricing_type || "fixed")}</p>
                </div>

                {selectedItem.pricing_type !== "variant" ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-600">Price</p>
                    <p className="text-sm font-semibold">
                      {selectedItem.unit_price && selectedItem.unit_price > 0
                        ? `${naira(Number(selectedItem.unit_price))}${selectedItem.unit_label ? ` / ${selectedItem.unit_label}` : ""}`
                        : `${naira(Number(selectedItem.price || 0))}${selectedItem.unit_label ? ` / ${selectedItem.unit_label}` : ""}`}
                    </p>
                  </div>
                ) : null}

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-600">Availability</p>
                  <p className="text-sm font-medium">{selectedItem.is_available ? "Available" : "Unavailable"}</p>
                </div>

                {selectedItem.min_qty !== null || selectedItem.max_qty !== null ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-600">Qty range</p>
                    <p className="text-sm font-medium">
                      {selectedItem.min_qty ?? 0}
                      {selectedItem.max_qty ? ` to ${selectedItem.max_qty}` : ""}
                    </p>
                  </div>
                ) : null}

                {selectedItem.stock_qty !== null ? (
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-sm text-gray-600">Stock</p>
                    <p className="text-sm font-medium">{selectedItem.stock_qty}</p>
                  </div>
                ) : null}
              </div>

              {selectedItem.pricing_type === "variant" ? (
                <div className="rounded-2xl border p-3">
                  <p className="font-semibold text-sm">Variants</p>

                  {detailsErr ? <p className="mt-2 text-sm text-red-600">{detailsErr}</p> : null}

                  {variantsLoading ? (
                    <p className="mt-2 text-sm text-gray-600">Loading variants...</p>
                  ) : variants.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">No variants yet.</p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {variants
                        .filter((v) => v.is_available)
                        .map((v) => (
                          <div key={v.id} className="rounded-xl border p-3 flex items-center justify-between">
                            <p className="text-sm">{v.name}</p>
                            <p className="text-sm font-semibold">{naira(Number(v.price || 0))}</p>
                          </div>
                        ))}
                    </div>
                  )}

                  <p className="mt-2 text-xs text-gray-500">
                    Variants are displayed for customers to choose inside the plate builder.
                  </p>
                </div>
              ) : null}

              <div className="grid gap-2">
                {plates.length > 0 ? (
                  <a
                    className="w-full rounded-xl bg-black px-4 py-3 text-white text-sm text-center"
                    href={`/food/vendors/${vendorId}/build-plate?plateId=${plates[0].id}`}
                  >
                    Build a plate
                  </a>
                ) : (
                  <p className="w-full rounded-xl border px-4 py-3 text-sm text-center text-gray-600">
                    No plate template yet for this vendor
                  </p>
                )}

                <button
                  type="button"
                  className="w-full rounded-xl border px-4 py-3 text-sm"
                  onClick={closeDetails}
                >
                  Close
                </button>
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
