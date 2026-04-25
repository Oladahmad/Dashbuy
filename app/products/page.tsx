/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import ToastBanner from "@/components/ToastBanner";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_CATEGORIES, normalizeProductCategory } from "@/lib/productCategories";
import { useRouter } from "next/navigation";

type Product = {
  id: string;
  vendor_id: string;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  image_path: string | null;
  created_at: string;
  profiles: { full_name: string; store_name: string | null } | null;
};

type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  vendorId: string;
  vendorName?: string | null;
};

const CART_KEY = "dashbuy_products_cart_v1";
const BUCKET = "product-images";

function naira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

function readCart(): { items: CartItem[] } {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : { items: [] };
  } catch {
    return { items: [] };
  }
}

function writeCart(cart: { items: CartItem[] }) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function getPublicImageUrl(path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

function vendorLabel(p: Product) {
  const store = (p.profiles?.store_name ?? "").trim();
  if (store) return store;
  const full = (p.profiles?.full_name ?? "").trim();
  if (full) return full;
  return "Vendor";
}

export default function ProductsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<Product[]>([]);

  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [cat, setCat] = useState<string>("all");
  const [minStr, setMinStr] = useState("");
  const [maxStr, setMaxStr] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);

  const [cartCount, setCartCount] = useState(0);
  const [cartToast, setCartToast] = useState("");

  function refreshCartCount() {
    const cart = readCart();
    const count = cart.items.reduce((sum, it) => sum + Number(it.qty), 0);
    setCartCount(count);
  }

  useEffect(() => {
    refreshCartCount();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMsg("");

      const res = await fetch("/api/catalog/products", { cache: "no-store" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        products?: Product[];
      };

      if (!res.ok || !body.ok) {
        setMsg(body.error ?? "Failed to load products");
        setProducts([]);
        setLoading(false);
        return;
      }

      const rows = Array.isArray(body.products) ? body.products : [];
      setProducts(rows);

      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const min = minStr.trim() ? Number(minStr) : null;
    const max = maxStr.trim() ? Number(maxStr) : null;

    return products.filter((p) => {
      if (qq) {
        const hay = `${p.name} ${p.description ?? ""} ${p.category ?? ""} ${vendorLabel(p)}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      if (cat !== "all" && normalizeProductCategory(p.category) !== cat) return false;
      if (min !== null && !Number.isNaN(min) && Number(p.price) < min) return false;
      if (max !== null && !Number.isNaN(max) && Number(p.price) > max) return false;
      return true;
    });
  }, [products, q, cat, minStr, maxStr]);

  function openDrawer(p: Product) {
    setActiveProduct(p);
    setQty(1);
    setDrawerOpen(true);
  }

  async function addToCart() {
    if (!activeProduct) return;

    const { data: u } = await supabase.auth.getUser();
    const user = u.user;

    const vendorId = String(activeProduct.vendor_id ?? "").trim();
    if (!vendorId) {
      setMsg("Vendor missing for this product");
      setDrawerOpen(false);
      return;
    }

    if (user && vendorId === user.id) {
      setMsg("You cannot add your own product to cart");
      setDrawerOpen(false);
      return;
    }

    const cart = readCart();

    const existing = cart.items.find((x) => x.productId === activeProduct.id);

    if (existing) existing.qty += qty;
    else {
      cart.items.push({
        productId: activeProduct.id,
        name: activeProduct.name,
        price: Number(activeProduct.price),
        qty,
        vendorId,
        vendorName: vendorLabel(activeProduct),
      });
    }

    writeCart(cart);
    refreshCartCount();
    setCartToast(`${activeProduct.name} added to cart`);
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!cartToast) return;
    const timer = window.setTimeout(() => setCartToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [cartToast]);

  function clearFilters() {
    setCat("all");
    setMinStr("");
    setMaxStr("");
  }

  return (
    <AppShell title="Products">
      {cartToast ? (
        <ToastBanner
          message={cartToast}
          actionLabel="View cart"
          onAction={() => {
            setCartToast("");
            router.push("/products/cart");
          }}
          onClose={() => setCartToast("")}
        />
      ) : null}
      <div className="rounded-2xl bg-black p-3">
        <div className="flex items-center gap-2">
          <input
            className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/60 outline-none"
            placeholder="Search products..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold"
            onClick={() => setShowFilters(true)}
            type="button"
          >
            Filter
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-white/70">
          <span>{filtered.length} items</span>
          <button
            type="button"
            className="underline"
            onClick={() => {
              setQ("");
              clearFilters();
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-3 -mx-1 overflow-x-auto">
        <div className="flex flex-nowrap min-w-max items-center gap-2 px-1 pb-1">
          <button
            type="button"
            onClick={() => setCat("all")}
            className={`shrink-0 rounded-full border px-3 py-2 text-sm whitespace-nowrap ${
              cat === "all" ? "bg-black text-white border-black" : "bg-white text-black"
            }`}
          >
            All
          </button>
          {PRODUCT_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-full border px-3 py-2 text-sm whitespace-nowrap ${
                cat === c ? "bg-black text-white border-black" : "bg-white text-black"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {cartCount > 0 ? (
        <div className="mt-3 rounded-2xl border bg-white p-3 flex items-center justify-between">
          <p className="text-sm text-gray-700">
            Cart: <strong>{cartCount}</strong> item(s)
          </p>
          <button
            className="rounded-xl bg-black px-4 py-2 text-sm text-white"
            onClick={() => router.push("/products/cart")}
            type="button"
          >
            Go to cart →
          </button>
        </div>
      ) : null}

      {msg ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-red-600">
          {msg}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-gray-600">
          Loading products...
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-gray-600">
          No products found.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => {
            const img = getPublicImageUrl(p.image_path);
            const vName = vendorLabel(p);

            return (
              <button
                key={p.id}
                onClick={() => openDrawer(p)}
                className="text-left rounded-2xl border bg-white overflow-hidden hover:bg-gray-50"
                type="button"
              >
                <div className="aspect-[4/3] bg-gray-100">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={p.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <div className="p-3">
                  <p className="text-sm font-semibold line-clamp-1">{p.name}</p>
                  <p className="mt-1 text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">
                    {normalizeProductCategory(p.category)} - {vName}
                  </p>
                  <p className="mt-2 font-bold">{naira(Number(p.price ?? 0))}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showFilters ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowFilters(false)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold">Filters</p>
              <button className="text-sm text-gray-600 underline" onClick={() => setShowFilters(false)} type="button">
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-sm font-medium">Min price</p>
                  <input
                    className="mt-2 w-full rounded-xl border p-3"
                    placeholder="e.g. 500"
                    inputMode="numeric"
                    type="number"
                    value={minStr}
                    onChange={(e) => setMinStr(e.target.value)}
                  />
                </div>

                <div>
                  <p className="text-sm font-medium">Max price</p>
                  <input
                    className="mt-2 w-full rounded-xl border p-3"
                    placeholder="e.g. 5000"
                    inputMode="numeric"
                    type="number"
                    value={maxStr}
                    onChange={(e) => setMaxStr(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                <button className="flex-1 rounded-xl border px-4 py-3" onClick={clearFilters} type="button">
                  Clear
                </button>
                <button className="flex-1 rounded-xl bg-black px-4 py-3 text-white" onClick={() => setShowFilters(false)} type="button">
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {drawerOpen && activeProduct ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white p-5">
            <div>
              <p className="text-lg font-semibold">{activeProduct.name}</p>
              <p className="text-sm text-gray-600">{naira(activeProduct.price)}</p>
            </div>

            <div className="mt-4 rounded-2xl border p-3">
              <div className="aspect-[4/3] overflow-hidden rounded-xl bg-gray-100">
                {getPublicImageUrl(activeProduct.image_path) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getPublicImageUrl(activeProduct.image_path) ?? ""}
                    alt={activeProduct.name}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>

              <div className="mt-3 grid gap-1 text-sm">
                <p>
                  <span className="text-gray-500">Vendor:</span> {vendorLabel(activeProduct)}
                </p>
                <p>
                  <span className="text-gray-500">Category:</span> {normalizeProductCategory(activeProduct.category)}
                </p>
                <p>
                  <span className="text-gray-500">Price:</span> {naira(activeProduct.price)}
                </p>
              </div>

              <div className="mt-3">
                <p className="text-sm font-medium">Description</p>
                <p className="mt-1 text-sm text-gray-600">
                  {activeProduct.description?.trim() ? activeProduct.description : "No description yet."}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl border p-3">
              <span className="text-sm font-medium">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-lg border px-3 py-1"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  type="button"
                >
                  -
                </button>
                <span className="w-8 text-center">{qty}</span>
                <button className="rounded-lg border px-3 py-1" onClick={() => setQty((q) => q + 1)} type="button">
                  +
                </button>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="min-w-20 rounded-xl border px-4 py-3 text-sm"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                Back
              </button>
              <button
                className="flex-1 rounded-xl bg-black px-4 py-3 text-white"
                onClick={addToCart}
                type="button"
              >
                Add to cart • {naira(activeProduct.price * qty)}
              </button>
            </div>

          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

