"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import HomeCarousel from "@/components/HomeCarousel";
import PwaInstallCard from "@/components/PwaInstallCard";
import { supabase } from "@/lib/supabaseClient";

type ProductRow = {
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

type RawProductRow = {
  id: string;
  vendor_id: string;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  image_path: string | null;
  created_at: string;
  profiles:
    | { full_name: string | null; store_name: string | null }
    | { full_name: string | null; store_name: string | null }[]
    | null;
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

function getPublicImageUrl(path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data?.publicUrl ?? null;
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

function naira(n: number) {
  return `\u20A6${Math.round(n).toLocaleString()}`;
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productsErr, setProductsErr] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<ProductRow | null>(null);
  const [qty, setQty] = useState(1);
  const [cartMsg, setCartMsg] = useState("");

  function vendorLabel(p: ProductRow) {
    const store = (p.profiles?.store_name ?? "").trim();
    if (store) return store;
    const full = (p.profiles?.full_name ?? "").trim();
    if (full) return full;
    return "";
  }

  function openDrawer(p: ProductRow) {
    setActiveProduct(p);
    setQty(1);
    setDrawerOpen(true);
  }

  async function addToCart() {
    if (!activeProduct) return;

    const { data: u } = await supabase.auth.getUser();
    const user = u.user;

    if (!user) {
      setCartMsg("Please login first at /auth");
      setDrawerOpen(false);
      return;
    }

    const vendorId = String(activeProduct.vendor_id ?? "").trim();
    if (!vendorId) {
      setCartMsg("Vendor missing for this product");
      setDrawerOpen(false);
      return;
    }

    if (vendorId === user.id) {
      setCartMsg("You cannot add your own product to cart");
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
    setCartMsg("Added to cart");
    setDrawerOpen(false);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      setProductsErr("");
      try {
        const res = await fetch("/api/catalog/products", { cache: "no-store" });
        const body = (await res.json()) as {
          ok?: boolean;
          error?: string;
          products?: ProductRow[];
        };

        if (res.ok && body.ok) {
          const rows = Array.isArray(body.products) ? body.products : [];
          setProducts(rows.slice(0, 8));
          setLoading(false);
          return;
        }
      } catch {
        // Fall back to public client query below.
      }

      const { data, error } = await supabase
        .from("products")
        .select("id,vendor_id,name,price,category,description,image_path,created_at,profiles:vendor_id(full_name,store_name)")
        .eq("is_available", true)
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) {
        setProducts([]);
        setProductsErr(error.message || "Failed to load products");
      } else {
        const rows = ((data ?? []) as RawProductRow[]).map((r) => {
          const p = Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles;
          return {
            id: r.id,
            vendor_id: r.vendor_id,
            name: r.name,
            price: Number(r.price ?? 0),
            category: r.category,
            description: r.description,
            image_path: r.image_path,
            created_at: r.created_at,
            profiles: p
              ? {
                  full_name: p.full_name ?? "",
                  store_name: p.store_name ?? null,
                }
              : null,
          } satisfies ProductRow;
        });
        setProducts(rows);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell title="Fast food & products around Ago">
      <div className="rounded-2xl border bg-white p-5">
        <h1 className="text-xl font-bold sm:text-2xl">What do you want today?</h1>
        <p className="mt-2 text-gray-600">Order food from nearby vendors or shop products.</p>

        <HomeCarousel
          intervalMs={4000}
          images={[
            "/home/slide1.jpg",
            "/home/slide2.jpg",
            "/home/slide3.jpg",
            "/home/slide4.jpg",
            "/home/slide5.jpg",
          ]}
        />

        <div className="mt-5 grid gap-3">
          <a
            href="/food"
            className="flex items-center justify-between rounded-xl bg-black px-4 py-4 text-white"
          >
            <span className="font-semibold">Order Food</span>
            <span>&rarr;</span>
          </a>

          <Link
            href="/products"
            className="flex items-center justify-between rounded-xl border px-4 py-4"
          >
            <span className="font-semibold">Shop Products</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </div>

      <PwaInstallCard />

      <div className="mt-5 overflow-hidden rounded-2xl border bg-white">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/banner.jpg" alt="Dashbuy promo" className="h-44 w-full object-cover" />

          <div className="absolute inset-0 bg-black/35" />

          <div className="absolute inset-0 flex flex-col justify-end p-4">
            <p className="text-xs text-white opacity-90">Sponsored</p>
            <h2 className="mt-1 text-lg font-bold text-white">Get food from as low as {"\u20A6"}2,000</h2>
            <p className="mt-1 text-sm text-white/90">Free delivery on all products on Dashbuy</p>

            <div className="mt-3">
              <a
                href="/food"
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold"
              >
                Order Food &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Trending on Dashbuy</h2>
          <Link href="/products" className="text-sm text-orange-600 underline">
            See all
          </Link>
        </div>

        {cartMsg ? (
          <div className="mt-3 rounded-2xl border bg-white p-4 text-sm text-green-700">{cartMsg}</div>
        ) : null}

        {loading ? (
          <div className="mt-3 rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading products...</div>
        ) : productsErr ? (
          <div className="mt-3 rounded-2xl border bg-white p-4 text-sm text-red-600">{productsErr}</div>
        ) : products.length === 0 ? (
          <div className="mt-3 rounded-2xl border bg-white p-4 text-sm text-gray-600">No products yet.</div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => {
              const img = getPublicImageUrl(p.image_path);

              return (
                <button
                  key={p.id}
                  onClick={() => openDrawer(p)}
                  className="overflow-hidden rounded-2xl border bg-white text-left hover:bg-gray-50"
                  type="button"
                >
                  <div className="h-24 w-full bg-gray-100">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={p.name} className="h-full w-full object-cover" />
                    ) : null}
                  </div>

                  <div className="p-3">
                    <p className="line-clamp-1 text-sm font-semibold">{p.name}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                      {p.category ?? "Product"}
                      {vendorLabel(p) ? ` - ${vendorLabel(p)}` : ""}
                    </p>
                    <p className="mt-2 font-bold">{naira(p.price)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {drawerOpen && activeProduct ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{activeProduct.name}</p>
                <p className="text-sm text-gray-600">{naira(activeProduct.price)}</p>
              </div>
              <button className="text-sm text-gray-600 underline" onClick={() => setDrawerOpen(false)} type="button">
                Close
              </button>
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
                  <span className="text-gray-500">Category:</span> {activeProduct.category ?? "Product"}
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
                <button className="rounded-lg border px-3 py-1" onClick={() => setQty((q) => Math.max(1, q - 1))} type="button">
                  -
                </button>
                <span className="w-8 text-center">{qty}</span>
                <button className="rounded-lg border px-3 py-1" onClick={() => setQty((q) => q + 1)} type="button">
                  +
                </button>
              </div>
            </div>

            <button className="mt-4 w-full rounded-xl bg-black px-4 py-3 text-white" onClick={addToCart} type="button">
              Add to cart • {naira(activeProduct.price * qty)}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border bg-white p-4">
        <h3 className="font-semibold">Sell on Dashbuy</h3>
        <p className="mt-1 text-sm text-gray-600">
          Own a shop or sell items? Create a vendor account and start receiving orders.
        </p>

        <div className="mt-3 flex gap-2">
          <a href="/auth/vendor-signup" className="rounded-xl bg-black px-4 py-2 text-sm text-white">
            Become a Vendor
          </a>
          <a href="/account" className="rounded-xl border px-4 py-2 text-sm">
            Learn more
          </a>
        </div>
      </div>
    </AppShell>
  );
}
