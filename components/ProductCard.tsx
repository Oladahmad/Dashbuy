"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Define props for ProductCard
type ProductCardProps = {
  id: string;
  price: number;
  category: string | null;
  description: string | null;
  vendorName: string | null;
};

// Update ProductCard to accept props
const ProductCard = ({
  id,
  price,
  category,
  description,
  vendorName,
}: ProductCardProps) => {
  // Render your product card here
  return (
    <div>
      <h2>{id}</h2>
      <p>Price: ₦{price}</p>
      <p>Category: {category}</p>
      <p>Description: {description}</p>
      <p>Vendor: {vendorName}</p>
    </div>
  );
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  created_at: string;
  vendors: { name: string } | null;
};

export default function ProductsStorePage() {
  const [all, setAll] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("products")
        .select(
          "id,name,description,category,price,created_at,vendors(name)"
        )
        .eq("is_available", true)
        .order("created_at", { ascending: true }); // OLDEST → NEWEST

      type SupabaseProductRow = {
        id: string;
        name: string;
        description: string | null;
        category: string | null;
        price: number;
        created_at: string;
        vendors: { name: string }[] | null;
      };

      setAll(
        (data ?? []).map((item: SupabaseProductRow) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          category: item.category,
          price: item.price,
          created_at: item.created_at,
          vendors: item.vendors && Array.isArray(item.vendors) && item.vendors.length > 0
            ? { name: item.vendors[0].name }
            : null,
        }))
      );
      setLoading(false);
    })();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    all.forEach((p) => p.category && set.add(p.category));
    return ["All", ...Array.from(set)];
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter((p) => {
      if (category !== "All" && p.category !== category) return false;

      if (search.trim()) {
        const hay = `${p.name} ${p.description ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }

      if (min && p.price < Number(min)) return false;
      if (max && p.price > Number(max)) return false;

      return true;
    });
  }, [all, search, category, min, max]);

  if (loading) {
    return <main className="p-6">Loading store...</main>;
  }

  return (
    <main className="p-4 max-w-6xl mx-auto">
      {/* Sticky Search + Filters */}
      <div className="sticky top-0 z-10 bg-gray-50 pb-3">
        <input
          className="w-full rounded-xl border p-3"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="mt-3 flex gap-2 overflow-x-auto">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-2 rounded-full text-sm border ${
                category === c
                  ? "bg-black text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <input
            className="rounded border p-2"
            placeholder="Min ₦"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
          <input
            className="rounded border p-2"
            placeholder="Max ₦"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </div>
      </div>

      {/* Results */}
      <p className="mt-4 text-sm text-gray-600">
        Showing <strong>{filtered.length}</strong> products
      </p>

      {/* Products grid */}
      <div className="mt-4 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            price={p.price}
            category={p.category}
            description={p.description}
            vendorName={p.vendors?.name ?? null}
          />
        ))}
      </div>
    </main>
  );
}
