"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { normalizeProductCategory } from "@/lib/productCategories";
import { useParams, useRouter } from "next/navigation";
import ToastBanner from "@/components/ToastBanner";

type ProfileLite = {
  store_name: string | null;
  full_name: string;
} | null;

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  stock_qty: number | null;
  vendor_id: string;
  profiles: ProfileLite;
};

type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  vendorId: string;
  vendorName: string;
};

type ProductsCart = {
  items: CartItem[];
};

const CART_KEY = "dashbuy_products_cart_v1";

function naira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

function safeParseCart(raw: string | null): ProductsCart {
  if (!raw) return { items: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { items: [] };
    const items = (parsed as { items?: unknown }).items;
    if (!Array.isArray(items)) return { items: [] };
    return { items: items as CartItem[] };
  } catch {
    return { items: [] };
  }
}

export default function ProductDetailsPage() {
  const { productId } = useParams<{ productId: string }>();
  const router = useRouter();

  const [p, setP] = useState<ProductRow | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [msg, setMsg] = useState<string>("Loading...");
  const [cartToast, setCartToast] = useState("");

  const vendorDisplayName = useMemo(() => {
    const prof = p?.profiles;
    if (!prof) return "Vendor";
    const sn = prof.store_name?.trim();
    if (sn) return sn;
    const fn = (prof.full_name || "").trim();
    return fn || "Vendor";
  }, [p]);

  useEffect(() => {
    (async () => {
      setMsg("Loading...");

      const { data, error } = await supabase
        .from("products")
        .select(
          `
          id,
          name,
          description,
          category,
          price,
          stock_qty,
          vendor_id,
          profiles:profiles!products_vendor_id_fkey (
            store_name,
            full_name
          )
        `
        )
        .eq("id", productId)
        .maybeSingle<ProductRow>();

      if (error || !data) {
        setMsg("Product not found");
        setP(null);
        return;
      }

      setP(data);
      setMsg("");
    })();
  }, [productId]);

  function addToCart() {
    if (!p) return;

    const cleanQty = Number.isFinite(qty) && qty > 0 ? Math.trunc(qty) : 1;

    const cart = safeParseCart(localStorage.getItem(CART_KEY));

    const existing = cart.items.find((x) => x.productId === p.id);

    if (existing) existing.qty += cleanQty;
    else {
      cart.items.push({
        productId: p.id,
        name: p.name,
        price: Number(p.price) || 0,
        qty: cleanQty,
        vendorId: p.vendor_id,
        vendorName: vendorDisplayName,
      });
    }

    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    setCartToast(`${p.name} added to cart`);
  }

  useEffect(() => {
    if (!cartToast) return;
    const timer = window.setTimeout(() => setCartToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [cartToast]);

  if (msg) return <main className="p-6">{msg}</main>;
  if (!p) return <main className="p-6">Not found</main>;

  return (
    <main className="p-6 max-w-xl">
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
      <h1 className="text-xl font-bold sm:text-2xl">{p.name}</h1>

      <p className="mt-1 text-xs text-gray-500">
        Sold by: <span className="font-medium">{vendorDisplayName}</span>
      </p>

      <p className="mt-2 text-sm text-gray-600">{normalizeProductCategory(p.category)}</p>

      <p className="mt-4 text-xl font-bold sm:text-2xl">{naira(p.price)}</p>

      {p.description ? (
        <p className="mt-4 text-gray-700">{p.description}</p>
      ) : (
        <p className="mt-4 text-gray-400">No description</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <input
          className="w-24 rounded border p-2"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />

        <button
          className="rounded bg-black px-4 py-2 text-white"
          onClick={addToCart}
          type="button"
        >
          Add to cart
        </button>
      </div>
    </main>
  );
}
