"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type VendorProfile = {
  id: string;
  store_name: string | null;
  full_name: string | null;
  store_address: string | null;
  address: string;
  logo_url: string | null;
  availability?: {
    isOpen: boolean;
    statusLabel: string;
    detail: string;
  };
};

type Plate = {
  id: string;
  name: string;
  plate_fee: number;
  is_active: boolean;
};

type Combo = {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  short_description: string | null;
  is_available: boolean;
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
  plates: unknown[];
  combos: ComboCartItem[];
};

const FOOD_CART_KEY = "dashbuy_food_cart_v1";

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
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

function readFoodCart(): FoodCart {
  if (typeof window === "undefined") return { vendorId: null, plates: [], combos: [] };
  try {
    const raw = localStorage.getItem(FOOD_CART_KEY);
    if (!raw) return { vendorId: null, plates: [], combos: [] };
    const parsed = JSON.parse(raw) as { vendorId?: string | null; plates?: unknown[]; combos?: ComboCartItem[] };
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
  const primaryVendorId = cart.vendorId ?? cart.combos[0]?.vendorId ?? null;
  localStorage.setItem(FOOD_CART_KEY, JSON.stringify({ ...cart, vendorId: primaryVendorId }));
}

export default function VendorPlateSelectPage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const router = useRouter();

  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [plates, setPlates] = useState<Plate[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [msg, setMsg] = useState("Loading...");

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
        combos?: Combo[];
      };

      if (!res.ok || !body.ok || !body.vendor) {
        setVendor(null);
        setPlates([]);
        setCombos([]);
        setMsg(body.error ?? "Vendor not found");
        return;
      }

      setVendor(body.vendor);
      setPlates(Array.isArray(body.plates) ? body.plates : []);
      setCombos(Array.isArray(body.combos) ? body.combos : []);
      setMsg("");
    })();
  }, [vendorId]);

  function addComboToCart(combo: Combo) {
    if (!vendorId) return;
    if (vendor?.availability?.isOpen === false) {
      window.alert(`${vendorName(vendor)} is currently closed.`);
      return;
    }
    const cart = readFoodCart();
    if (!cart.vendorId) cart.vendorId = vendorId;

    const existing = cart.combos.find((x) => x.comboId === combo.id);
    if (existing) existing.qty += 1;
    else {
      cart.combos.push({
        comboId: combo.id,
        name: combo.name,
        price: Number(combo.price || 0),
        qty: 1,
        vendorId,
        vendorName: vendorName(vendor),
      });
    }

    writeFoodCart(cart);
    window.alert("Added to cart");
  }

  if (msg) return <main className="p-6">{msg}</main>;

  return (
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <button
        type="button"
        className="rounded-xl border px-3 py-2 text-sm"
        onClick={() => router.push("/food")}
      >
        Back
      </button>

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{vendorName(vendor)}</h1>
            <p className="mt-1 text-sm text-gray-600">{vendorArea(vendor)}</p>
            <p className={`mt-2 text-xs font-medium ${vendor?.availability?.isOpen === false ? "text-red-600" : "text-emerald-700"}`}>
              {vendor?.availability?.statusLabel ?? "Open now"}
            </p>
            {vendor?.availability?.detail ? <p className="mt-1 text-xs text-gray-500">{vendor.availability.detail}</p> : null}
            <p className="mt-2 text-xs text-gray-500">Select a plate to continue.</p>
          </div>

          {vendor?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vendor.logo_url}
              alt={vendorName(vendor)}
              className="h-12 w-12 shrink-0 rounded-xl border object-cover"
            />
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="text-base font-semibold">Available plates</h2>

        {plates.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No plates available for this vendor yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {plates.map((p) => (
              <a
                key={p.id}
                href={`/food/vendors/${vendorId}/build-plate?plateId=${p.id}`}
                className={`rounded-xl border px-4 py-3 ${vendor?.availability?.isOpen === false ? "pointer-events-none opacity-60" : "hover:bg-gray-50"}`}
              >
                <p className="font-semibold">{p.name}</p>
                <p className="mt-1 text-sm text-gray-600">Plate fee: {naira(Number(p.plate_fee || 0))}</p>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4">
        <h2 className="text-base font-semibold">Available combos</h2>

        {combos.length === 0 ? (
          <p className="mt-3 text-sm text-gray-600">No combos available for this vendor yet.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {combos.map((combo) => (
              <div key={combo.id} className="overflow-hidden rounded-2xl border bg-white">
                <div className="aspect-[4/3] bg-gray-100">
                  {combo.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={combo.image_url} alt={combo.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold">{combo.name}</p>
                  <p className="mt-2 text-sm font-bold">{naira(Number(combo.price ?? 0))}</p>
                  {combo.short_description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-gray-600">{combo.short_description}</p>
                  ) : null}
                </div>
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    className="w-full rounded-xl bg-black px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => addComboToCart(combo)}
                    disabled={vendor?.availability?.isOpen === false}
                  >
                    {vendor?.availability?.isOpen === false ? "Restaurant closed" : "Add combo"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
