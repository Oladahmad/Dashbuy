"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ProductRow = {
  id: string;
  vendor_id: string;
  name: string;
  price: number;
  image_path: string | null;
  created_at: string;
  is_available: boolean | null;
};

function formatNaira(n: number) {
  const v = Math.max(0, Math.floor(n));
  return "₦" + v.toLocaleString();
}

function getProductImagePublicUrl(pathOrUrl: string | null) {
  if (!pathOrUrl) return null;

  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  const { data } = supabase.storage.from("product-images").getPublicUrl(pathOrUrl);
  return data.publicUrl || null;
}

export default function VendorProductsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setErr(null);

      const { data: u } = await supabase.auth.getUser();
      const user = u.user;

      if (!user) {
        if (alive) {
          setErr("Not signed in");
          setLoading(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("products")
        .select("id,vendor_id,name,price,image_path,created_at,is_available")
        .eq("vendor_id", user.id)
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (error) {
        setErr(error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as ProductRow[]);
      }

      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, []);

  async function toggleAvailable(id: string, nextAvailable: boolean) {
    setErr(null);
    setActionId(id);

    const { error } = await supabase
      .from("products")
      .update({ is_available: nextAvailable })
      .eq("id", id);

    if (error) {
      setErr(error.message);
      setActionId(null);
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_available: nextAvailable } : r)));
    setActionId(null);
  }

  async function deleteProduct(id: string) {
    const yes = window.confirm("Delete this product?");
    if (!yes) return;

    setErr(null);
    setActionId(id);

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      setErr(error.message);
      setActionId(null);
      return;
    }

    setRows((prev) => prev.filter((r) => r.id !== id));
    setActionId(null);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">Your products</p>
          <p className="text-base font-semibold">Manage listings</p>
        </div>

        <Link href="/vendor/products/new" className="rounded-xl bg-black px-4 py-2 text-white text-sm">
          Add product
        </Link>
      </div>

      {err ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{err}</div> : null}

      <div className="rounded-2xl border bg-white p-4">
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-600">No product yet</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const available = r.is_available !== false;
              const img = getProductImagePublicUrl(r.image_path);

              return (
                <div key={r.id} className="rounded-2xl border bg-white p-3 flex gap-3">
                  <div className="h-14 w-14 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                    {img ? (
                      <Image
                        src={img}
                        alt={r.name}
                        width={56}
                        height={56}
                        className="h-14 w-14 object-cover"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link href={`/vendor/products/${r.id}`} className="font-semibold block truncate">
                      {r.name}
                    </Link>
                    <p className="text-sm text-gray-600 mt-1">{formatNaira(r.price)}</p>
                  </div>

                  <details className="relative">
                    <summary className="list-none cursor-pointer rounded-xl border px-3 py-2 text-sm">
                      Options
                    </summary>
                    <div className="absolute right-0 z-10 mt-2 w-40 rounded-xl border bg-white p-2 shadow-sm">
                      <Link
                        href={`/vendor/products/${r.id}`}
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-gray-100"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-100 disabled:opacity-50"
                        onClick={() => deleteProduct(r.id)}
                        disabled={actionId === r.id}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className={`mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-50 ${
                          available ? "text-gray-900" : "text-black font-medium"
                        }`}
                        onClick={() => toggleAvailable(r.id, !available)}
                        disabled={actionId === r.id}
                      >
                        {actionId === r.id ? "Saving..." : available ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
