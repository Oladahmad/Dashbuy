"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabaseClient";
import HomeCarousel from "@/components/HomeCarousel";


type ProductRow = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  created_at: string;
  vendors: { name: string }[] | null;
};

function naira(n: number) {
  return `₦${Math.round(n).toLocaleString()}`;
}

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductRow[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data } = await supabase
        .from("products")
        .select("id,name,price,category,created_at,vendors(name)")
        .eq("is_available", true)
        .order("created_at", { ascending: false })
        .limit(8);

      setProducts((data as ProductRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell title="Fast food & products around Ago">
      {/* 1) Quick Actions (your block) */}
        <div className="rounded-2xl bg-white border p-5">
  <h1 className="text-2xl font-bold">What do you want today?</h1>
  <p className="mt-2 text-gray-600">
    Order food from nearby vendors or shop products.
  </p>

  {/* ✅ Carousel goes here */}
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
      className="rounded-xl bg-black text-white px-4 py-4 flex items-center justify-between"
    >
      <span className="font-semibold">Order Food</span>
      <span>→</span>
    </a>

    <Link
      href="/products"
      className="rounded-xl border px-4 py-4 flex items-center justify-between"
    >
      <span className="font-semibold">Shop Products</span>
      <span>→</span>
    </Link>
  </div>
</div>


      {/* Optional tip card (still okay to keep) */}
      <div className="mt-5 rounded-2xl bg-white border p-5">
        <p className="font-semibold">Quick tip</p>
        <p className="mt-1 text-sm text-gray-600">
          Install Dashbuy on your phone for faster ordering (PWA coming soon).
        </p>
      </div>

      {/* 2) Sponsored Hero Banner */}
      <div className="mt-5 rounded-2xl overflow-hidden border bg-white">
        <div className="relative">
          {/* Put your banner image in /public/banner.jpg */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/banner.jpg"
            alt="Dashbuy promo"
            className="h-44 w-full object-cover"
          />

          <div className="absolute inset-0 bg-black/35" />

          <div className="absolute inset-0 flex flex-col justify-end p-4">
            <p className="text-white text-xs opacity-90">Sponsored</p>
            <h2 className="mt-1 text-white text-lg font-bold">
              Get food from as low as ₦2,000
            </h2>
            <p className="mt-1 text-white/90 text-sm">
              Free delivery on all products on Dashbuy
            </p>

            <div className="mt-3">
              <a
                href="/food"
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold"
              >
                Order Food →
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 3) Trending Products */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Trending on Dashbuy</h2>
          <Link href="/products" className="text-sm text-orange-600 underline">
            See all
          </Link>
        </div>

        {loading ? (
          <div className="mt-3 rounded-2xl border bg-white p-4 text-sm text-gray-600">
            Loading products...
          </div>
        ) : products.length === 0 ? (
          <div className="mt-3 rounded-2xl border bg-white p-4 text-sm text-gray-600">
            No products yet.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <a
                key={p.id}
                href={`/products/${p.id}`}
                className="rounded-2xl border bg-white p-3 hover:bg-gray-50"
              >
                <p className="text-sm font-semibold line-clamp-1">{p.name}</p>
                <p className="mt-1 text-xs text-gray-500 line-clamp-1">
                  {p.category ?? "Product"}
                  {p.vendors?.[0]?.name ? ` • ${p.vendors[0].name}` : ""}
                </p>
                <p className="mt-2 font-bold">{naira(p.price)}</p>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* 4) Become a vendor CTA */}
      <div className="mt-6 rounded-2xl border bg-white p-4">
        <h3 className="font-semibold">Sell on Dashbuy</h3>
        <p className="mt-1 text-sm text-gray-600">
          Own a shop or sell items? Create a vendor account and start receiving orders.
        </p>

        <div className="mt-3 flex gap-2">
          <a
            href="/auth/vendor-signup"
            className="rounded-xl bg-black px-4 py-2 text-sm text-white"
          >
            Become a Vendor
          </a>
          <a
            href="/account"
            className="rounded-xl border px-4 py-2 text-sm"
          >
            Learn more
          </a>
        </div>
      </div>
    </AppShell>
  );
}
