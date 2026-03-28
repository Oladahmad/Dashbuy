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

type VariantRow = {
  id: string;
  food_item_id: string;
  name: string;
  price: number;
  is_available: boolean;
};

function naira(n: number) {
  return `N${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  if (i < 0) return "jpg";
  return name.slice(i + 1).toLowerCase();
}

function nowId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function cap(s: string | null) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FoodItemRow | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [variantName, setVariantName] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantSaving, setVariantSaving] = useState(false);
  const [variantBusyId, setVariantBusyId] = useState<string | null>(null);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [openVariantMenuId, setOpenVariantMenuId] = useState<string | null>(null);
  const [editVariantName, setEditVariantName] = useState("");
  const [editVariantPrice, setEditVariantPrice] = useState("");

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editUnitPrice, setEditUnitPrice] = useState("");
  const [editUnitLabel, setEditUnitLabel] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemDeleting, setItemDeleting] = useState(false);
  const [detailsMsg, setDetailsMsg] = useState<string | null>(null);

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
    setOpenMenuId(null);
  }

  async function deleteFoodFromList(it: FoodItemRow) {
    const yes = window.confirm("Delete this food item?");
    if (!yes) return;

    setMsg(null);
    setTogglingId(it.id);

    const { error } = await supabase.from("food_items").delete().eq("id", it.id);
    if (error) {
      setTogglingId(null);
      setMsg("Delete food failed: " + error.message);
      return;
    }

    setItems((prev) => prev.filter((x) => x.id !== it.id));
    setTogglingId(null);
    setOpenMenuId(null);
  }

  async function openDetails(it: FoodItemRow) {
    setSelectedItem(it);
    setDetailsOpen(true);
    setDetailsMsg(null);
    setVariants([]);
    setVariantName("");
    setVariantPrice("");
    setVariantBusyId(null);
    setEditingVariantId(null);
    setEditVariantName("");
    setEditVariantPrice("");
    setItemSaving(false);
    setItemDeleting(false);
    setEditName(it.name ?? "");
    setEditDescription(it.short_description ?? "");
    setEditPrice(String(it.price ?? ""));
    setEditUnitPrice(String(it.unit_price ?? ""));
    setEditUnitLabel(it.unit_label ?? "");
    setEditStock(String(it.stock_qty ?? ""));
    setEditImageFile(null);
    setEditOpen(false);

    if ((it.pricing_type ?? "fixed") !== "variant") return;

    setVariantsLoading(true);
    const { data, error } = await supabase
      .from("food_item_variants")
      .select("id,food_item_id,name,price,is_available")
      .eq("food_item_id", it.id)
      .order("price", { ascending: true });

    if (error) {
      setDetailsMsg("Variants error: " + error.message);
      setVariantsLoading(false);
      return;
    }

    setVariants((data as VariantRow[]) ?? []);
    setVariantsLoading(false);
  }

  function closeDetails() {
    setDetailsOpen(false);
    setSelectedItem(null);
    setVariants([]);
    setVariantName("");
    setVariantPrice("");
    setVariantBusyId(null);
    setEditingVariantId(null);
    setEditVariantName("");
    setEditVariantPrice("");
    setEditName("");
    setEditDescription("");
    setEditPrice("");
    setEditUnitPrice("");
    setEditUnitLabel("");
    setEditStock("");
    setEditImageFile(null);
    setEditOpen(false);
    setDetailsMsg(null);
    setVariantsLoading(false);
    setVariantSaving(false);
    setItemSaving(false);
    setItemDeleting(false);
    setOpenMenuId(null);
    setOpenVariantMenuId(null);
  }

  async function addVariant() {
    if (!selectedItem) return;
    if ((selectedItem.pricing_type ?? "fixed") !== "variant") return;

    setDetailsMsg(null);
    const name = variantName.trim();
    const price = Number(variantPrice);

    if (!name) {
      setDetailsMsg("Variant name is required.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setDetailsMsg("Enter a valid variant price.");
      return;
    }

    setVariantSaving(true);
    const { error } = await supabase.from("food_item_variants").insert({
      food_item_id: selectedItem.id,
      name,
      price,
      is_available: true,
    });

    if (error) {
      setVariantSaving(false);
      setDetailsMsg("Add variant failed: " + error.message);
      return;
    }

    const { data, error: reloadErr } = await supabase
      .from("food_item_variants")
      .select("id,food_item_id,name,price,is_available")
      .eq("food_item_id", selectedItem.id)
      .order("price", { ascending: true });

    if (reloadErr) {
      setVariantSaving(false);
      setDetailsMsg("Reload variants failed: " + reloadErr.message);
      return;
    }

    setVariants((data as VariantRow[]) ?? []);
    setVariantName("");
    setVariantPrice("");
    setVariantSaving(false);
    setDetailsMsg("Variant added.");
  }

  async function toggleVariant(v: VariantRow) {
    setDetailsMsg(null);
    const next = !v.is_available;
    setVariantBusyId(v.id);

    const { error } = await supabase
      .from("food_item_variants")
      .update({ is_available: next })
      .eq("id", v.id);

    if (error) {
      setVariantBusyId(null);
      setDetailsMsg("Update variant failed: " + error.message);
      return;
    }

    setVariants((prev) =>
      prev.map((x) => (x.id === v.id ? { ...x, is_available: next } : x))
    );
    setVariantBusyId(null);
    setOpenVariantMenuId(null);
  }

  function beginEditVariant(v: VariantRow) {
    setEditingVariantId(v.id);
    setEditVariantName(v.name);
    setEditVariantPrice(String(v.price));
    setDetailsMsg(null);
    setOpenVariantMenuId(null);
  }

  function cancelEditVariant() {
    setEditingVariantId(null);
    setEditVariantName("");
    setEditVariantPrice("");
    setOpenVariantMenuId(null);
  }

  async function saveVariantEdit(variantId: string) {
    const name = editVariantName.trim();
    const price = Number(editVariantPrice);
    if (!name) {
      setDetailsMsg("Variant name is required.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setDetailsMsg("Enter a valid variant price.");
      return;
    }

    setVariantBusyId(variantId);
    const { error } = await supabase
      .from("food_item_variants")
      .update({ name, price })
      .eq("id", variantId);

    if (error) {
      setVariantBusyId(null);
      setDetailsMsg("Edit variant failed: " + error.message);
      return;
    }

    setVariants((prev) =>
      prev.map((x) => (x.id === variantId ? { ...x, name, price } : x))
    );
    setVariantBusyId(null);
    setEditingVariantId(null);
    setEditVariantName("");
    setEditVariantPrice("");
    setOpenVariantMenuId(null);
    setDetailsMsg("Variant updated.");
  }

  async function deleteVariant(variantId: string) {
    setVariantBusyId(variantId);
    const { error } = await supabase.from("food_item_variants").delete().eq("id", variantId);
    if (error) {
      setVariantBusyId(null);
      setDetailsMsg("Delete variant failed: " + error.message);
      return;
    }
    setVariants((prev) => prev.filter((x) => x.id !== variantId));
    if (editingVariantId === variantId) cancelEditVariant();
    setVariantBusyId(null);
    setOpenVariantMenuId(null);
    setDetailsMsg("Variant deleted.");
  }

  async function saveFoodEdits() {
    if (!selectedItem) return;
    const name = editName.trim();
    if (!name) {
      setDetailsMsg("Food name is required.");
      return;
    }

    const patch: Record<string, unknown> = {
      name,
      short_description: editDescription.trim() || null,
      unit_label: editUnitLabel.trim() || null,
      stock_qty: editStock.trim() ? Number(editStock) : null,
    };

    const pricingType = selectedItem.pricing_type ?? "fixed";
    const foodType = selectedItem.food_type ?? "single";

    if (foodType === "combo" || pricingType === "fixed") {
      patch.price = editPrice.trim() ? Number(editPrice) : 0;
    }

    if (pricingType === "per_scoop" || pricingType === "per_unit") {
      patch.unit_price = editUnitPrice.trim() ? Number(editUnitPrice) : 0;
    }

    setItemSaving(true);

    if (editImageFile) {
      const ext = fileExt(editImageFile.name);
      const path = `vendors/${selectedItem.vendor_id}/foods/${nowId()}.${ext}`;

      const up = await supabase.storage.from("food-images").upload(path, editImageFile, {
        upsert: true,
        contentType: editImageFile.type || "image/jpeg",
      });

      if (up.error) {
        setItemSaving(false);
        setDetailsMsg("Image upload failed: " + up.error.message);
        return;
      }

      const pub = supabase.storage.from("food-images").getPublicUrl(path);
      patch.image_url = pub.data.publicUrl || null;
    }

    const { data, error } = await supabase
      .from("food_items")
      .update(patch)
      .eq("id", selectedItem.id)
      .select(
        "id,vendor_id,name,food_type,category,pricing_type,price,unit_price,unit_label,is_available,stock_qty,image_url,short_description,created_at"
      )
      .maybeSingle();

    if (error || !data) {
      setItemSaving(false);
      setDetailsMsg("Save food failed: " + (error?.message ?? "Not found"));
      return;
    }

    const updated = data as FoodItemRow;
    setSelectedItem(updated);
    setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    setItemSaving(false);
    setDetailsMsg("Food updated.");
  }

  async function deleteFood() {
    if (!selectedItem) return;
    if (!confirm("Delete this food item?")) return;

    setItemDeleting(true);
    const { error } = await supabase.from("food_items").delete().eq("id", selectedItem.id);
    if (error) {
      setItemDeleting(false);
      setDetailsMsg("Delete food failed: " + error.message);
      return;
    }

    setItems((prev) => prev.filter((x) => x.id !== selectedItem.id));
    closeDetails();
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
              <div className="mt-4 space-y-2">
                {combos.map((it) => (
                  <div key={it.id} className="rounded-2xl border bg-white p-3 flex gap-3">
                    <div className="h-14 w-14 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                      {it.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.image_url}
                          alt={it.name}
                          className="h-14 w-14 object-cover"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="block w-full truncate text-left font-semibold"
                        onClick={() => openDetails(it)}
                      >
                        {it.name}
                      </button>
                      <p className="mt-1 text-sm text-gray-600">{priceLabel(it)}</p>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        className="rounded-xl border px-3 py-2 text-sm"
                        onClick={() => setOpenMenuId((prev) => (prev === it.id ? null : it.id))}
                      >
                        Options
                      </button>
                      {openMenuId === it.id ? (
                        <>
                          <button
                            type="button"
                            className="fixed inset-0 z-10 cursor-default"
                            aria-label="Close options"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 z-20 mt-2 w-40 rounded-xl border bg-white p-2 shadow-sm">
                            <button
                              type="button"
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                              onClick={() => {
                                setOpenMenuId(null);
                                openDetails(it);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-100 disabled:opacity-50"
                              onClick={() => deleteFoodFromList(it)}
                              disabled={togglingId === it.id}
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-50"
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
                        </>
                      ) : null}
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
              <div className="mt-4 space-y-2">
                {singles.map((it) => (
                  <div key={it.id} className="rounded-2xl border bg-white p-3 flex gap-3">
                    <div className="h-14 w-14 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                      {it.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.image_url}
                          alt={it.name}
                          className="h-14 w-14 object-cover"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="block w-full truncate text-left font-semibold"
                        onClick={() => openDetails(it)}
                      >
                        {it.name}
                      </button>
                      <p className="mt-1 text-sm text-gray-600">{priceLabel(it)}</p>
                    </div>

                    <div className="relative">
                      <button
                        type="button"
                        className="rounded-xl border px-3 py-2 text-sm"
                        onClick={() => setOpenMenuId((prev) => (prev === it.id ? null : it.id))}
                      >
                        Options
                      </button>
                      {openMenuId === it.id ? (
                        <>
                          <button
                            type="button"
                            className="fixed inset-0 z-10 cursor-default"
                            aria-label="Close options"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 z-20 mt-2 w-40 rounded-xl border bg-white p-2 shadow-sm">
                            <button
                              type="button"
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                              onClick={() => {
                                setOpenMenuId(null);
                                openDetails(it);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-100 disabled:opacity-50"
                              onClick={() => deleteFoodFromList(it)}
                              disabled={togglingId === it.id}
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 disabled:opacity-50"
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
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {detailsOpen && selectedItem ? (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3"
          onClick={closeDetails}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <div className="min-w-0 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                  {selectedItem.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selectedItem.image_url}
                      alt={selectedItem.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-600">
                    {cap(selectedItem.food_type ?? "single")}
                  </p>
                  <p className="text-base font-semibold truncate">{selectedItem.name}</p>
                </div>
              </div>

              <button
                type="button"
                className="rounded-xl border px-3 py-2 text-sm"
                onClick={closeDetails}
              >
                Close
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="rounded-2xl border p-3">
                <button
                  type="button"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  onClick={() => setEditOpen((v) => !v)}
                >
                  {editOpen ? "Hide edit" : "Edit item"}
                </button>

                {editOpen ? (
                    <div className="mt-3">
                      <div className="grid gap-2">
                      <div className="rounded-xl border p-3">
                        <p className="text-xs text-gray-600">Thumbnail</p>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="relative h-16 w-16 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                            {selectedItem.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={selectedItem.image_url}
                                alt={selectedItem.name}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>

                          <div className="flex-1">
                            <label
                              htmlFor="edit-food-photo"
                              className="inline-flex rounded-lg border px-3 py-1 text-sm cursor-pointer"
                            >
                              Edit photo
                            </label>
                            <input
                              id="edit-food-photo"
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => setEditImageFile(e.target.files?.[0] ?? null)}
                              disabled={itemSaving || itemDeleting}
                            />
                            {editImageFile ? (
                              <p className="mt-1 text-xs text-gray-600 truncate">{editImageFile.name}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <input
                        className="rounded-xl border px-3 py-2 text-sm"
                        placeholder="Food name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={itemSaving || itemDeleting}
                      />

                      <textarea
                        className="rounded-xl border px-3 py-2 text-sm"
                        placeholder="Short description"
                        rows={2}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        disabled={itemSaving || itemDeleting}
                      />

                      {(selectedItem.food_type ?? "single") === "combo" ||
                      (selectedItem.pricing_type ?? "fixed") === "fixed" ? (
                        <input
                          className="rounded-xl border px-3 py-2 text-sm"
                          placeholder="Price"
                          inputMode="numeric"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          disabled={itemSaving || itemDeleting}
                        />
                      ) : null}

                      {(selectedItem.pricing_type ?? "fixed") === "per_scoop" ||
                      (selectedItem.pricing_type ?? "fixed") === "per_unit" ? (
                        <input
                          className="rounded-xl border px-3 py-2 text-sm"
                          placeholder="Unit price"
                          inputMode="numeric"
                          value={editUnitPrice}
                          onChange={(e) => setEditUnitPrice(e.target.value)}
                          disabled={itemSaving || itemDeleting}
                        />
                      ) : null}

                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          className="rounded-xl border px-3 py-2 text-sm"
                          placeholder="Unit label"
                          value={editUnitLabel}
                          onChange={(e) => setEditUnitLabel(e.target.value)}
                          disabled={itemSaving || itemDeleting}
                        />
                        <input
                          className="rounded-xl border px-3 py-2 text-sm"
                          placeholder="Stock qty"
                          inputMode="numeric"
                          value={editStock}
                          onChange={(e) => setEditStock(e.target.value)}
                          disabled={itemSaving || itemDeleting}
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        className="rounded-xl bg-black px-3 py-2 text-white text-sm disabled:opacity-60"
                        onClick={saveFoodEdits}
                        disabled={itemSaving || itemDeleting}
                      >
                        {itemSaving ? "Saving..." : "Save changes"}
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
                        onClick={deleteFood}
                        disabled={itemSaving || itemDeleting}
                      >
                        {itemDeleting ? "Deleting..." : "Delete food"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {selectedItem.short_description ? (
                <p className="text-sm text-gray-700">{selectedItem.short_description}</p>
              ) : (
                <p className="text-sm text-gray-500">No description yet.</p>
              )}

              <div className="rounded-2xl border p-3 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-600">Category</p>
                  <p className="text-sm font-medium">{cap(selectedItem.category || "main")}</p>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-600">Pricing</p>
                  <p className="text-sm font-medium">{cap(selectedItem.pricing_type || "fixed")}</p>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-600">Price</p>
                  <p className="text-sm font-semibold">{priceLabel(selectedItem)}</p>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-600">Stock</p>
                  <p className="text-sm font-medium">
                    {selectedItem.stock_qty === null ? "Not set" : selectedItem.stock_qty}
                  </p>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-600">Status</p>
                  <p className="text-sm font-medium">
                    {selectedItem.is_available ?? true ? "Available" : "Disabled"}
                  </p>
                </div>
              </div>

              {(selectedItem.pricing_type ?? "fixed") === "variant" ? (
                <div className="rounded-2xl border p-3">
                  <p className="font-semibold text-sm">Variants</p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      className="rounded-xl border px-3 py-2 text-sm"
                      placeholder="Variant name"
                      value={variantName}
                      onChange={(e) => setVariantName(e.target.value)}
                      disabled={variantSaving}
                    />
                    <input
                      className="rounded-xl border px-3 py-2 text-sm"
                      placeholder="Price"
                      value={variantPrice}
                      onChange={(e) => setVariantPrice(e.target.value)}
                      inputMode="numeric"
                      disabled={variantSaving}
                    />
                  </div>

                  <button
                    type="button"
                    className="mt-2 w-full rounded-xl bg-black px-3 py-2 text-white text-sm disabled:opacity-60"
                    onClick={addVariant}
                    disabled={variantSaving}
                  >
                    {variantSaving ? "Adding..." : "Add variant"}
                  </button>

                  {variantsLoading ? (
                    <p className="mt-3 text-sm text-gray-600">Loading variants...</p>
                  ) : variants.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-600">No variant yet.</p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {variants.map((v) => (
                        <div key={v.id} className="rounded-lg border px-3 py-2.5 flex items-center justify-between gap-2">
                          {editingVariantId === v.id ? (
                            <div className="w-full space-y-2">
                              <input
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                                value={editVariantName}
                                onChange={(e) => setEditVariantName(e.target.value)}
                                disabled={variantBusyId === v.id}
                              />
                              <input
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                                inputMode="numeric"
                                value={editVariantPrice}
                                onChange={(e) => setEditVariantPrice(e.target.value)}
                                disabled={variantBusyId === v.id}
                              />
                              <div className="grid grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg bg-black px-3 py-1 text-sm text-white"
                                  onClick={() => saveVariantEdit(v.id)}
                                  disabled={variantBusyId === v.id}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border px-3 py-1 text-sm"
                                  onClick={cancelEditVariant}
                                  disabled={variantBusyId === v.id}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border px-3 py-1 text-sm"
                                  onClick={() => deleteVariant(v.id)}
                                  disabled={variantBusyId === v.id}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{v.name}</p>
                                <p className="text-xs text-gray-600">{naira(v.price)}</p>
                              </div>
                              <div className="relative">
                                <button
                                  type="button"
                                  className="rounded-lg border px-3 py-1 text-sm"
                                  onClick={() =>
                                    setOpenVariantMenuId((prev) => (prev === v.id ? null : v.id))
                                  }
                                  disabled={variantBusyId === v.id}
                                >
                                  Options
                                </button>
                                {openVariantMenuId === v.id ? (
                                  <>
                                    <button
                                      type="button"
                                      aria-label="Close variant options"
                                      className="fixed inset-0 z-10"
                                      onClick={() => setOpenVariantMenuId(null)}
                                    />
                                    <div className="absolute right-0 top-9 z-20 min-w-[140px] rounded-xl border bg-white p-1 shadow-lg">
                                      <button
                                        type="button"
                                        className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                                        onClick={() => beginEditVariant(v)}
                                        disabled={variantBusyId === v.id}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100"
                                        onClick={() => toggleVariant(v)}
                                        disabled={variantBusyId === v.id}
                                      >
                                        {v.is_available ? "Disable" : "Enable"}
                                      </button>
                                      <button
                                        type="button"
                                        className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-100"
                                        onClick={() => deleteVariant(v.id)}
                                        disabled={variantBusyId === v.id}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {detailsMsg ? <p className="text-sm text-gray-700">{detailsMsg}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="h-2" />
    </div>
  );
}
