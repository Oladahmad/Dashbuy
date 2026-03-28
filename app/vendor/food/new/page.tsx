"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type FoodCategory = "main" | "side" | "protein" | "swallow" | "soup" | "drink" | "extra";
type PricingType = "fixed" | "per_scoop" | "per_unit" | "variant";
type FoodType = "single" | "combo";

type VariantDraft = {
  name: string;
  price: string;
  is_available: boolean;
};

type PlateTemplate = {
  id: string;
  name: string;
  plate_fee: number;
  is_active: boolean;
};

function clean(s: string) {
  return s.trim();
}

function toNumberOrNull(s: string) {
  const t = clean(s);
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function toIntOrNull(s: string) {
  const t = clean(s);
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  if (i < 0) return "jpg";
  return name.slice(i + 1).toLowerCase();
}

function nowId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export default function VendorNewFoodPage() {
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [foodType, setFoodType] = useState<FoodType>("single");

  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");

  const [category, setCategory] = useState<FoodCategory>("main");
  const [pricingType, setPricingType] = useState<PricingType>("per_scoop");

  const [unitLabel, setUnitLabel] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [fixedPrice, setFixedPrice] = useState("");

  const [stockQty, setStockQty] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);

  const [imageFile, setImageFile] = useState<File | null>(null);

  const [variants, setVariants] = useState<VariantDraft[]>([
    { name: "", price: "", is_available: true },
  ]);
  const [plates, setPlates] = useState<PlateTemplate[]>([]);
  const [plateName, setPlateName] = useState("");
  const [plateFee, setPlateFee] = useState("");
  const [plateSaving, setPlateSaving] = useState(false);
  const [plateMsg, setPlateMsg] = useState<string | null>(null);

  function explainPlateError(message: string) {
    if (message.includes("plate_templates.vendor_id")) {
      return "Database update needed: add vendor_id column to plate_templates first.";
    }
    return message;
  }

  const showSingleFields = foodType === "single";
  const showComboFields = foodType === "combo";
  const hasPlates = plates.length > 0;
  const singleLocked = showSingleFields && !hasPlates;

  const showUnitPricing =
    showSingleFields && (pricingType === "per_scoop" || pricingType === "per_unit");
  const showVariants = showSingleFields && pricingType === "variant";
  const showFixedPricing = showComboFields || (showSingleFields && pricingType === "fixed");

  const recommendedUnitLabel = useMemo(() => {
    if (pricingType === "per_scoop") return "Scoop";
    if (pricingType === "per_unit") return "Piece";
    if (pricingType === "fixed") return "Portion";
    if (pricingType === "variant") return "Option";
    return "";
  }, [pricingType]);

  const canSave = useMemo(() => {
    const n = clean(name);
    if (!n) return false;

    if (!imageFile) return false;

    if (showSingleFields && !hasPlates) return false;

    if (foodType === "combo") {
      const p = toNumberOrNull(fixedPrice);
      if (p === null || p <= 0) return false;
      const sq = toIntOrNull(stockQty);
      if (sq === null || sq < 0) return false;
      return true;
    }

    if (pricingType === "fixed") {
      const p = toNumberOrNull(fixedPrice);
      if (p === null || p <= 0) return false;
      return true;
    }

    if (pricingType === "per_scoop" || pricingType === "per_unit") {
      const p = toNumberOrNull(unitPrice);
      if (p === null || p <= 0) return false;
      return true;
    }

    if (pricingType === "variant") {
      const good = variants.filter((v) => clean(v.name) && (toNumberOrNull(v.price) ?? 0) > 0);
      if (good.length === 0) return false;
      return true;
    }

    return false;
  }, [name, imageFile, showSingleFields, hasPlates, foodType, pricingType, fixedPrice, stockQty, unitPrice, variants]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const vendorId = u.user?.id;
      if (!vendorId) {
        setPlateMsg("Please login first.");
        return;
      }

      const { data, error } = await supabase
        .from("plate_templates")
        .select("id,name,plate_fee,is_active")
        .eq("vendor_id", vendorId)
        .eq("is_active", true)
        .order("plate_fee", { ascending: true });

      if (error) {
        setPlateMsg("Could not load plates: " + explainPlateError(error.message));
        return;
      }

      setPlates((data as PlateTemplate[]) ?? []);
    })();
  }, []);

  async function addPlateTemplate() {
    setPlateMsg(null);

    const n = clean(plateName);
    const fee = toNumberOrNull(plateFee);

    if (!n) {
      setPlateMsg("Plate name is required.");
      return;
    }
    if (fee === null || fee < 0) {
      setPlateMsg("Enter a valid plate fee.");
      return;
    }

    setPlateSaving(true);

    const { data: u } = await supabase.auth.getUser();
    const vendorId = u.user?.id;
    if (!vendorId) {
      setPlateSaving(false);
      setPlateMsg("Please login first.");
      return;
    }

    const { error } = await supabase.from("plate_templates").insert({
      vendor_id: vendorId,
      name: n,
      plate_fee: fee,
      is_active: true,
    });

    if (error) {
      setPlateSaving(false);
      setPlateMsg("Plate error: " + explainPlateError(error.message));
      return;
    }

    const { data } = await supabase
      .from("plate_templates")
      .select("id,name,plate_fee,is_active")
      .eq("vendor_id", vendorId)
      .eq("is_active", true)
      .order("plate_fee", { ascending: true });

    setPlates((data as PlateTemplate[]) ?? []);
    setPlateName("");
    setPlateFee("");
    setPlateSaving(false);
    setPlateMsg("Plate added.");
  }

  async function uploadFoodImage(file: File, vendorId: string) {
    const ext = fileExt(file.name);
    const path = `vendors/${vendorId}/foods/${nowId()}.${ext}`;

    const up = await supabase.storage.from("food-images").upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

    if (up.error) throw new Error(up.error.message);

    const pub = supabase.storage.from("food-images").getPublicUrl(path);
    const url = pub.data.publicUrl;
    if (!url) throw new Error("Could not get public URL for image");

    return url;
  }

  async function createFoodItem() {
    setErr(null);
    setOk(null);

    const n = clean(name);
    const d = clean(shortDescription);

    if (!n) {
      setErr("Food name is required");
      return;
    }

    if (!imageFile) {
      setErr("Food image is required");
      return;
    }

    if (singleLocked) {
      setErr("Add at least one plate first before listing single foods.");
      return;
    }

    setSaving(true);

    const { data: u, error: uerr } = await supabase.auth.getUser();
    if (uerr) {
      setSaving(false);
      setErr(uerr.message);
      return;
    }

    const user = u.user;
    if (!user) {
      setSaving(false);
      setErr("Not signed in");
      return;
    }

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) {
      setSaving(false);
      setErr("Profile error: " + pErr.message);
      return;
    }

    const role = (profile?.role ?? "customer") as string;
    const isVendorFood = role === "vendor_food" || role === "admin";

    if (!isVendorFood) {
      setSaving(false);
      setErr("Vendor profile not found");
      return;
    }

    const vendorId = user.id;

    let imageUrl = "";
    try {
      imageUrl = await uploadFoodImage(imageFile, vendorId);
    } catch (e: unknown) {
      setSaving(false);
      setErr(e instanceof Error ? e.message : "Image upload failed");
      return;
    }

    const sq = toIntOrNull(stockQty);

    const fixed = toNumberOrNull(fixedPrice);
    const unit = toNumberOrNull(unitPrice);

    const payload: Record<string, unknown> = {
      vendor_id: vendorId,
      name: n,
      food_type: foodType,
      image_url: imageUrl,
      short_description: d || null,
      is_available: isAvailable,

      category: showSingleFields ? category : "main",
      pricing_type: showSingleFields ? pricingType : "fixed",
      unit_label: clean(unitLabel) ? clean(unitLabel) : (recommendedUnitLabel || null),

      min_qty: showSingleFields ? 1 : 0,
      max_qty: null,

      stock_qty: showComboFields ? (sq ?? 0) : null,
    };

    if (showFixedPricing) {
      payload.price = fixed ?? 0;
      payload.unit_price = null;
    } else if (showUnitPricing) {
      payload.price = 0;
      payload.unit_price = unit ?? 0;
    } else if (showVariants) {
      payload.price = 0;
      payload.unit_price = null;
    }

    const ins = await supabase.from("food_items").insert(payload).select("id").maybeSingle();
    if (ins.error) {
      setSaving(false);
      setErr(ins.error.message);
      return;
    }

    const foodId = ins.data?.id as string | undefined;
    if (!foodId) {
      setSaving(false);
      setErr("Could not read created food id");
      return;
    }

    if (showVariants) {
      const good = variants
        .map((v) => ({
          name: clean(v.name),
          price: toNumberOrNull(v.price),
          is_available: v.is_available,
        }))
        .filter((v) => v.name && (v.price ?? 0) > 0);

      if (good.length > 0) {
        const variantRows = good.map((v, idx) => ({
          food_item_id: foodId,
          name: v.name,
          price: v.price as number,
          is_available: v.is_available,
          sort_order: idx,
        }));

        const vins = await supabase.from("food_item_variants").insert(variantRows);
        if (vins.error) {
          setSaving(false);
          setErr("Food saved but variants failed: " + vins.error.message);
          return;
        }
      }
    }

    setSaving(false);
    setOk("Food saved");
    router.push("/vendor/food");
  }

  function setSmartDefaultsForSingle(nextPricing: PricingType) {
    if (nextPricing === "per_scoop") {
      setUnitLabel("Scoop");
    }
    if (nextPricing === "per_unit") {
      setUnitLabel("Piece");
    }
    if (nextPricing === "fixed") {
      setUnitLabel("Portion");
    }
    if (nextPricing === "variant") {
      setUnitLabel("Option");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm text-gray-600">Add new food</p>
        <p className="text-base font-semibold">Create single foods and combos</p>
      </div>

      <div className="rounded-2xl border bg-white p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-600">Plates</p>
            <p className="text-base font-semibold">Add plate options for customers</p>
          </div>
          <button
            type="button"
            className="h-10 rounded-xl border px-4 text-sm font-medium self-start sm:self-auto"
            onClick={() => router.push("/vendor/plates")}
            disabled={saving || plateSaving}
          >
            Open plates page
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-xl border px-3 py-3"
            placeholder="Plate name (e.g. Standard)"
            value={plateName}
            onChange={(e) => setPlateName(e.target.value)}
            disabled={plateSaving || saving}
          />
          <input
            className="rounded-xl border px-3 py-3"
            placeholder="Plate fee (e.g. 500)"
            value={plateFee}
            onChange={(e) => setPlateFee(e.target.value)}
            inputMode="numeric"
            disabled={plateSaving || saving}
          />
        </div>

        <button
          type="button"
          className="w-full rounded-xl bg-black px-4 py-3 text-sm text-white disabled:opacity-60"
          onClick={addPlateTemplate}
          disabled={plateSaving || saving}
        >
          {plateSaving ? "Adding..." : "Add plate"}
        </button>

        {plateMsg ? <p className="text-sm text-gray-700">{plateMsg}</p> : null}

        {plates.length === 0 ? (
          <p className="text-xs text-gray-600">No plate yet.</p>
        ) : (
          <div className="grid gap-2">
            {plates.slice(0, 5).map((p) => (
              <div key={p.id} className="rounded-xl border p-3 text-sm flex items-center justify-between gap-3">
                <span className="font-medium">{p.name}</span>
                <strong>{Number(p.plate_fee || 0).toLocaleString()}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {err ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{err}</div>
      ) : null}
      {ok ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-green-700">{ok}</div>
      ) : null}

      <div className="rounded-2xl border bg-white p-4 space-y-4">
        <div>
          <label className="text-sm text-gray-700">Food type</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-xl border px-3 py-3 text-sm ${
                foodType === "single" ? "bg-black text-white border-black" : "bg-white"
              }`}
              onClick={() => {
                setFoodType("single");
                setPricingType("per_scoop");
                setSmartDefaultsForSingle("per_scoop");
              }}
              disabled={saving}
            >
              Single
            </button>

            <button
              type="button"
              className={`rounded-xl border px-3 py-3 text-sm ${
                foodType === "combo" ? "bg-black text-white border-black" : "bg-white"
              }`}
              onClick={() => {
                setFoodType("combo");
                setPricingType("fixed");
                setUnitLabel("Portion");
              }}
              disabled={saving}
            >
              Combo
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            Single means customer builds plate, combo means fixed price like a product.
          </p>
          {singleLocked ? (
            <p className="mt-2 text-xs font-medium text-red-600">
              Add at least one plate first before listing single foods.
            </p>
          ) : null}
        </div>

        <div>
          <label className="text-sm text-gray-700">Food name</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-3"
            placeholder="Eg Jollof rice"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving || singleLocked}
          />
        </div>

        <div>
          <label className="text-sm text-gray-700">Image</label>
          <div className="mt-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-800">Add food image</p>
            <p className="mt-1 text-xs text-gray-600">Use a clear photo so customers can see exactly what they will get.</p>
            <input
              className="mt-3 w-full rounded-xl border bg-white px-3 py-3 text-sm"
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              disabled={saving || singleLocked}
            />
            {imageFile ? <p className="mt-2 text-xs text-gray-700">Selected: {imageFile.name}</p> : null}
          </div>
        </div>

        {showSingleFields ? (
          <div className="rounded-xl border border-black/20 bg-black/[0.03] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-800">
              Recommended
            </p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              Please read this before listing single foods.
            </p>
            <details className="mt-3 rounded-lg border bg-white p-3">
              <summary className="cursor-pointer text-sm font-semibold text-gray-900">
                Single food listing details
              </summary>
              <div className="mt-3 space-y-2 text-xs text-gray-700">
                <p>
                  <strong>Per scoop:</strong> Price for each scoop.
                  Examples: jollof rice, fried rice.
                </p>
                <p>
                  <strong>Per unit:</strong> Price for each piece/unit.
                  Examples: chicken piece, boiled egg.
                </p>
                <p>
                  <strong>Variant:</strong> One food with different options and prices.
                  Examples: turkey (small/medium/big), fish (small/big).
                </p>
                <p>
                  <strong>Fixed:</strong> One serving at one fixed price.
                  Examples: amala pack, noodles pack.
                </p>
              </div>
            </details>
          </div>
        ) : null}

        {showComboFields ? (
          <div>
            <label className="text-sm text-gray-700">Details</label>
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-3"
              placeholder="Add useful details for this combo."
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              rows={3}
              disabled={saving}
            />
          </div>
        ) : null}

        {showSingleFields ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm text-gray-700">Category</label>
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-3"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FoodCategory)}
                  disabled={saving || singleLocked}
                >
                  <option value="main">Main</option>
                  <option value="side">Side</option>
                  <option value="protein">Protein</option>
                  <option value="swallow">Swallow</option>
                  <option value="soup">Soup</option>
                  <option value="drink">Drink</option>
                  <option value="extra">Extra</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-700">Pricing</label>
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-3"
                  value={pricingType}
                  onChange={(e) => {
                    const next = e.target.value as PricingType;
                    setPricingType(next);
                    setSmartDefaultsForSingle(next);
                    setFixedPrice("");
                    setUnitPrice("");
                  }}
                  disabled={saving || singleLocked}
                >
                  <option value="per_scoop">Per scoop</option>
                  <option value="per_unit">Per unit</option>
                  <option value="variant">Variant</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>
            </div>

            {showUnitPricing ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-gray-700">Unit label</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-3"
                    placeholder={recommendedUnitLabel || "Eg Scoop"}
                    value={unitLabel}
                    onChange={(e) => setUnitLabel(e.target.value)}
                    disabled={saving || singleLocked}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-700">Unit price</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-3"
                    placeholder="Eg 300"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    inputMode="numeric"
                    disabled={saving || singleLocked}
                  />
                </div>
              </div>
            ) : null}

            {showFixedPricing && showSingleFields ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-gray-700">Fixed price</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-3"
                    placeholder="Eg 1200"
                    value={fixedPrice}
                    onChange={(e) => setFixedPrice(e.target.value)}
                    inputMode="numeric"
                    disabled={saving || singleLocked}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-700">Unit label</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-3"
                    placeholder="Eg Portion"
                    value={unitLabel}
                    onChange={(e) => setUnitLabel(e.target.value)}
                    disabled={saving || singleLocked}
                  />
                </div>
              </div>
            ) : null}

            {showVariants ? (
              <div className="rounded-2xl border p-3">
                <p className="font-semibold">Variants</p>
                <p className="mt-1 text-xs text-gray-600">
                  Use this for turkey sizes, fish sizes, or any protein options with different prices.
                </p>

                <div className="mt-3 space-y-2">
                  {variants.map((v, idx) => (
                    <div key={idx} className="rounded-xl border p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-600">Variant name</label>
                          <input
                            className="mt-1 w-full rounded-xl border px-3 py-2"
                            placeholder="Eg Turkey big"
                            value={v.name}
                            onChange={(e) => {
                              const copy = variants.slice();
                              copy[idx] = { ...copy[idx], name: e.target.value };
                              setVariants(copy);
                            }}
                            disabled={saving || singleLocked}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-600">Price</label>
                          <input
                            className="mt-1 w-full rounded-xl border px-3 py-2"
                            placeholder="Eg 2000"
                            value={v.price}
                            onChange={(e) => {
                              const copy = variants.slice();
                              copy[idx] = { ...copy[idx], price: e.target.value };
                              setVariants(copy);
                            }}
                            inputMode="numeric"
                            disabled={saving || singleLocked}
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={v.is_available}
                          onChange={(e) => {
                            const copy = variants.slice();
                            copy[idx] = { ...copy[idx], is_available: e.target.checked };
                            setVariants(copy);
                          }}
                          disabled={saving || singleLocked}
                        />
                        Available
                      </label>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-xl border px-3 py-2 text-sm"
                          onClick={() => {
                            const copy = variants.slice();
                            copy.splice(idx, 1);
                            setVariants(
                              copy.length ? copy : [{ name: "", price: "", is_available: true }]
                            );
                          }}
                          disabled={saving || singleLocked}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="mt-3 w-full rounded-xl border px-4 py-3 text-sm"
                  onClick={() => setVariants([...variants, { name: "", price: "", is_available: true }])}
                  disabled={saving || singleLocked}
                >
                  Add another variant
                </button>
              </div>
            ) : null}

          </>
        ) : null}

        {showComboFields ? (
          <>
            <div>
              <label className="text-sm text-gray-700">Combo price</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3"
                placeholder="Eg 2500"
                value={fixedPrice}
                onChange={(e) => setFixedPrice(e.target.value)}
                inputMode="numeric"
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Stock qty</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-3"
                placeholder="How many combo packs are available now? e.g 10"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                inputMode="numeric"
                disabled={saving}
              />
              <p className="mt-2 text-xs text-gray-600">This is the number of combo packs you can still sell.</p>
            </div>
          </>
        ) : null}

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isAvailable}
            onChange={(e) => setIsAvailable(e.target.checked)}
            disabled={saving}
          />
          Available for customers
        </label>

        <button
          type="button"
          className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
          disabled={saving}
          onClick={createFoodItem}
        >
          {saving ? "Saving…" : "Save"}
        </button>

        <button
          type="button"
          className="w-full rounded-xl border px-4 py-3 text-sm"
          onClick={() => router.push("/vendor/food")}
          disabled={saving}
        >
          Back
        </button>
      </div>
    </div>
  );
}
