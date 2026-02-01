"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type FoodItemRow = {
  id: string;
  vendor_id: string;
  name: string;
  food_type: "single" | "combo" | null;
  category: string | null;
  pricing_type: string | null;
  price: number | null;
  unit_price: number | null;
  unit_label: string | null;
  is_available: boolean | null;
  stock_qty: number | null;
  image_url: string | null;
  short_description: string | null;
  created_at: string | null;
};

function naira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

function priceLabel(it: FoodItemRow) {
  const ft = it.food_type ?? "single";
  const pt = it.pricing_type ?? "fixed";

  if (ft === "combo") return naira(Number(it.price || 0));

  if (pt === "per_scoop" || pt === "per_unit") {
    const unit = Number(it.unit_price || 0);
    const label = it.unit_label?.trim() ? it.unit_label : pt === "per_scoop" ? "Scoop" : "Unit";
    return `${naira(unit)} per ${label}`;
  }

  if (pt === "variant") return "Variant pricing";

  return naira(Number(it.price || 0));
}

export default function VendorFoodPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [items, setItems] = useState<FoodItemRow[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg(null);

      const { data: u, error: uErr } = await supabase.auth.getUser();
      if (uErr) {
        if (!alive) return;
        setLoading(false);
        setMsg(uErr.message);
        return;
      }

      const user = u.user;
      if (!user) {
        router.replace("/auth/login?mode=vendor");
        return;
      }

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (pErr) {
        if (!alive) return;
        setLoading(false);
        setMsg("Profile error: " + pErr.message);
        return;
      }

      const role = (prof?.role ?? "customer") as string;
      const isFoodVendor = role === "vendor_food" || role === "admin";

      if (!isFoodVendor) {
        router.replace("/vendor");
        return;
      }

      const { data, error } = await supabase
        .from("food_items")
        .select(
          "id,vendor_id,name,food_type,category,pricing_type,price,unit_price,unit_label,is_available,stock_qty,image_url,short_description,created_at"
        )
        .eq("vendor_id", user.id)
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (error) {
        setLoading(false);
        setMsg(error.message);
        return;
      }

      setItems((data as FoodItemRow[]) || []);
      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, [router]);

  const combos = useMemo(
    () => items.filter((x) => (x.food_type ?? "single") === "combo"),
    [items]
  );

  const singles = useMemo(
    () => items.filter((x) => (x.food_type ?? "single") !== "combo"),
    [items]
  );

  async function toggleAvailable(it: FoodItemRow) {
    setMsg(null);
    setTogglingId(it.id);

    const next = !(it.is_available ?? true);

    const { error } = await supabase
      .from("food_items")
      .update({ is_available: next })
      .eq("id", it.id);

    if (error) {
      setTogglingId(null);
      setMsg(error.message);
      return;
    }

    setItems((prev) =>
      prev.map((x) => (x.id === it.id ? { ...x, is_available: next } : x))
    );

    setTogglingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-600">Your foods</p>
            <p className="text-base font-semibold">Singles and combos</p>
          </div>

          <button
            type="button"
            className="rounded-xl bg-black px-4 py-3 text-sm text-white"
            onClick={() => router.push("/vendor/food/new")}
          >
            Add food
          </button>
        </div>

        {msg ? <p className="mt-3 text-sm text-red-600">{msg}</p> : null}
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">
          Loading foods...
        </div>
      ) : (
        <>
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">Combos</p>
              <p className="text-sm text-gray-600">{combos.length}</p>
            </div>

            {combos.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">No combo uploaded yet.</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {combos.map((it) => (
                  <div key={it.id} className="rounded-2xl border bg-white overflow-hidden">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => router.push(`/vendor/food/${it.id}`)}
                    >
                      <div className="aspect-square w-full bg-gray-100">
                        {it.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.image_url}
                            alt={it.name}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="p-3">
                        <p className="text-sm font-semibold line-clamp-1">{it.name}</p>
                        <p className="mt-1 text-xs text-gray-600 line-clamp-1">
                          {priceLabel(it)}
                        </p>

                        <p className="mt-2 text-xs text-gray-500">
                          {it.is_available ?? true ? "Available" : "Disabled"}
                        </p>
                      </div>
                    </button>

                    <div className="p-3 pt-0">
                      <button
                        type="button"
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        onClick={() => toggleAvailable(it)}
                        disabled={togglingId === it.id}
                      >
                        {togglingId === it.id
                          ? "Updating..."
                          : it.is_available ?? true
                          ? "Disable"
                          : "Enable"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold">Singles</p>
              <p className="text-sm text-gray-600">{singles.length}</p>
            </div>

            {singles.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600">No single food uploaded yet.</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {singles.map((it) => (
                  <div key={it.id} className="rounded-2xl border bg-white overflow-hidden">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => router.push(`/vendor/food/${it.id}`)}
                    >
                      <div className="aspect-square w-full bg-gray-100">
                        {it.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.image_url}
                            alt={it.name}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="p-3">
                        <p className="text-sm font-semibold line-clamp-1">{it.name}</p>
                        <p className="mt-1 text-xs text-gray-600 line-clamp-1">
                          {priceLabel(it)}
                        </p>

                        <p className="mt-2 text-xs text-gray-500">
                          {it.is_available ?? true ? "Available" : "Disabled"}
                        </p>
                      </div>
                    </button>

                    <div className="p-3 pt-0">
                      <button
                        type="button"
                        className="w-full rounded-xl border px-3 py-2 text-sm"
                        onClick={() => toggleAvailable(it)}
                        disabled={togglingId === it.id}
                      >
                        {togglingId === it.id
                          ? "Updating..."
                          : it.is_available ?? true
                          ? "Disable"
                          : "Enable"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-2" />
    </div>
  );
}
