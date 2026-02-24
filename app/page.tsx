"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import HomeCarousel from "@/components/HomeCarousel";
import { supabase } from "@/lib/supabaseClient";

type ProductRow = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  image_path: string | null;
  created_at: string;
  profiles: { full_name: string; store_name: string | null } | null;
};

function getPublicImageUrl(path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data?.publicUrl ?? null;
}

function naira(n: number) {
  return `\u20A6${Math.round(n).toLocaleString()}`;
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productsErr, setProductsErr] = useState("");

  function vendorLabel(p: ProductRow) {
    const store = (p.profiles?.store_name ?? "").trim();
    if (store) return store;
    const full = (p.profiles?.full_name ?? "").trim();
    if (full) return full;
    return "";
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
        .select("id,name,price,category,image_path,created_at,profiles:vendor_id(full_name,store_name)")
        .eq("is_available", true)
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) {
        setProducts([]);
        setProductsErr(error.message || "Failed to load products");
      } else {
        setProducts((data as ProductRow[]) ?? []);
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

      <div className="mt-5 rounded-2xl border bg-white p-5">
        <p className="font-semibold">Quick tip</p>
        <p className="mt-1 text-sm text-gray-600">
          Install Dashbuy on your phone for faster ordering (PWA coming soon).
        </p>
      </div>

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
                <a
                  key={p.id}
                  href={`/products/${p.id}`}
                  className="overflow-hidden rounded-2xl border bg-white hover:bg-gray-50"
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
                </a>
              );
            })}
          </div>
        )}
      </div>

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
