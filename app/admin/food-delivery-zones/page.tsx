"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { FOOD_VENDOR_ORIGIN_OPTIONS } from "@/lib/foodDeliveryMatrix";

type FoodDeliveryVendor = {
  id: string;
  name: string;
  food_delivery_origin: string | null;
};

export default function AdminFoodDeliveryZonesPage() {
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState<FoodDeliveryVendor[]>([]);
  const [savingVendorOriginId, setSavingVendorOriginId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg("");

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        if (alive) {
          setMsg("Session expired. Please log in again.");
          setLoading(false);
        }
        return;
      }

      const res = await fetch("/api/admin/food-delivery-zones", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; items?: FoodDeliveryVendor[] }
        | null;

      if (!alive) return;

      if (!res.ok || !body?.ok) {
        setMsg(body?.error ?? "Unable to load food vendors.");
        setItems([]);
        setLoading(false);
        return;
      }

      setItems(body.items ?? []);
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  async function saveFoodDeliveryOrigin(vendorId: string) {
    setMsg("");
    setSavingVendorOriginId(vendorId);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMsg("Session expired. Please log in again.");
      setSavingVendorOriginId(null);
      return;
    }

    const row = items.find((item) => item.id === vendorId);
    const res = await fetch("/api/admin/food-delivery-zones", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vendorId,
        foodDeliveryOrigin: row?.food_delivery_origin ?? null,
      }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!res.ok || !body?.ok) {
      setMsg(body?.error ?? "Could not save food vendor location.");
    }
    setSavingVendorOriginId(null);
  }

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">Food delivery zones</p>
            <p className="mt-1 text-sm text-gray-600">
              Set the logistics base location for each food vendor before customers check out.
            </p>
          </div>
          <Link href="/admin" className="rounded-xl border px-4 py-2 text-sm">
            Back
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        {loading ? <p className="text-sm text-gray-600">Loading vendors...</p> : null}
        {!loading && msg ? <p className="text-sm text-red-600">{msg}</p> : null}
        {!loading && !msg && items.length === 0 ? (
          <p className="text-sm text-gray-600">No food vendors found yet.</p>
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="grid gap-3">
            {items.map((vendor) => (
              <div key={vendor.id} className="rounded-2xl border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{vendor.name}</p>
                    <p className="mt-1 text-xs text-gray-500">Vendor ID: {vendor.id}</p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                      className="rounded-xl border px-3 py-2 text-sm"
                      value={vendor.food_delivery_origin ?? ""}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row) =>
                            row.id === vendor.id ? { ...row, food_delivery_origin: e.target.value || null } : row
                          )
                        )
                      }
                    >
                      <option value="">Select base location</option>
                      {FOOD_VENDOR_ORIGIN_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                      disabled={savingVendorOriginId === vendor.id}
                      onClick={() => saveFoodDeliveryOrigin(vendor.id)}
                    >
                      {savingVendorOriginId === vendor.id ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}
