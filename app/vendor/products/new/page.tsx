"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ProductCategory, PRODUCT_CATEGORIES, normalizeProductCategory } from "@/lib/productCategories";
import { getProductFeatureOptions, getProductFeaturePlaceholder } from "@/lib/productFeatures";

type Role = "customer" | "vendor_food" | "vendor_products" | "admin";
type FeatureField = { key: string; value: string };
type FieldErrors = Partial<{
  image: string;
  name: string;
  price: string;
  stockQty: string;
  category: string;
  description: string;
  form: string;
}>;

function toIntOrNull(s: string) {
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v >= 0 ? v : null;
}

function splitFeatureValues(raw: string) {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function VendorProductsNewPage() {
  const router = useRouter();

  const [role, setRole] = useState<Role>("customer");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [features, setFeatures] = useState<FeatureField[]>([]);
  const [featureKey, setFeatureKey] = useState("");
  const [featureValue, setFeatureValue] = useState("");
  const featureOptions = getProductFeatureOptions(category as ProductCategory | "");

  useEffect(() => {
    let alive = true;

    async function loadRole() {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) return;

      const { data: p } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle<{ role: Role }>();

      if (!alive) return;
      setRole((p?.role ?? "customer") as Role);
    }

    loadRole();

    return () => {
      alive = false;
    };
  }, []);

  const isAllowed = role === "vendor_products" || role === "admin";

  async function fileToDataUrl(f: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(f);
    });
  }

  async function onGenerateDescription() {
    setFieldErrors({});

    const p = toIntOrNull(price);
    const q = toIntOrNull(stockQty);

    if (!name.trim()) {
      setFieldErrors({ description: "To generate AI text, enter Product name first." });
      return;
    }
    if (!category) {
      setFieldErrors({ description: "To generate AI text, select Category first." });
      return;
    }
    if (p === null || p <= 0) {
      setFieldErrors({ description: "To generate AI text, enter Price first." });
      return;
    }

    setAiLoading(true);
    let imageDataUrl = "";

    try {
      if (file && file.size <= 2 * 1024 * 1024) {
        imageDataUrl = await fileToDataUrl(file);
      }
    } catch {
      // Ignore image read failure and generate from text only.
    }

    const cleanFeatures = features
      .map((f) => ({ key: f.key.trim(), value: f.value.trim() }))
      .filter((f) => f.key && f.value);

    const resp = await fetch("/api/ai/product-description", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        category: normalizeProductCategory(category),
        price: p,
        stockQty: q ?? 0,
        features: cleanFeatures,
        imageDataUrl: imageDataUrl || undefined,
      }),
    });

    const body = (await resp.json().catch(() => null)) as { ok?: boolean; description?: string; error?: string } | null;
    setAiLoading(false);

    if (!resp.ok || !body?.ok || !body.description) {
      setFieldErrors({ description: body?.error ?? "Failed to generate description" });
      return;
    }

    setDesc(body.description);
  }

  function addFeature() {
    const key = featureKey.trim();
    const values = splitFeatureValues(featureValue);
    if (!key || values.length === 0) {
      setFieldErrors((prev) => ({ ...prev, form: "Select a feature and enter its value before adding." }));
      return;
    }
    setFeatures((prev) => {
      const i = prev.findIndex((x) => x.key === key);
      if (i < 0) return [...prev, { key, value: values.join(", ") }];

      const existing = splitFeatureValues(prev[i].value);
      const merged = Array.from(new Set([...existing, ...values]));
      const next = [...prev];
      next[i] = { ...next[i], value: merged.join(", ") };
      return next;
    });
    setFeatureKey("");
    setFeatureValue("");
    setFieldErrors((prev) => ({ ...prev, form: undefined }));
  }

  async function onCreate() {
    setFieldErrors({});

    const p = toIntOrNull(price);
    const q = toIntOrNull(stockQty);

    if (!isAllowed) {
      setFieldErrors({ form: "You do not have access" });
      return;
    }
    if (!file) {
      setFieldErrors({ image: "Please choose an image" });
      return;
    }
    if (!name.trim()) {
      setFieldErrors({ name: "Please enter a name" });
      return;
    }
    if (p === null || p <= 0) {
      setFieldErrors({ price: "Please enter a valid price" });
      return;
    }
    if (q === null) {
      setFieldErrors({ stockQty: "Please enter a valid stock quantity" });
      return;
    }
    if (!category) {
      setFieldErrors({ category: "Please select a category" });
      return;
    }

    setLoading(true);

    const { data: u } = await supabase.auth.getUser();
    const user = u.user;

    if (!user) {
      setLoading(false);
      setFieldErrors({ form: "Not signed in" });
      return;
    }

    const ext = file.name.split(".").pop() || "jpg";
    const path = `products/${user.id}/${crypto.randomUUID()}.${ext}`;

    const up = await supabase.storage.from("product-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

    if (up.error) {
      setLoading(false);
      setFieldErrors({ image: up.error.message });
      return;
    }

    const payload: Record<string, unknown> = {
      vendor_id: user.id,
      name: name.trim(),
      description: desc.trim() || null,
      price: p,
      stock_qty: q ?? 0,
      is_available: true,
      category: normalizeProductCategory(category),
      image_path: path,
    };

    const ins = await supabase.from("products").insert(payload).select("id").maybeSingle();

    if (ins.error) {
      setLoading(false);
      setFieldErrors({ form: ins.error.message });
      return;
    }
    // Under RLS, insert can succeed but RETURNING row can be empty without select policy.
    // If no error, treat as success.

    setLoading(false);
    router.push("/vendor/products");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <p className="text-sm text-gray-600">Add product</p>
        <p className="text-base font-semibold">Create listing</p>
      </div>

      {!isAllowed ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">
          You do not have access to add products
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div>
          <label className="text-sm text-gray-700">Name</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-3"
            placeholder="Product name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }}
            disabled={!isAllowed}
          />
          {fieldErrors.name ? <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p> : null}
        </div>

        <div>
          <label className="text-sm text-gray-700">Image</label>
          <div className="mt-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-800">Add product image</p>
            <p className="mt-1 text-xs text-gray-600">Choose a clear image so buyers can trust what they are ordering.</p>
            <input
              className="mt-3 w-full rounded-xl border bg-white px-3 py-3 text-sm"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={!isAllowed}
            />
            {file ? <p className="mt-2 text-xs text-gray-700">Selected: {file.name}</p> : null}
          </div>
          {fieldErrors.image ? <p className="mt-1 text-xs text-red-600">{fieldErrors.image}</p> : null}
        </div>

        <div>
          <label className="text-sm text-gray-700">Price</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-3"
            placeholder="Enter price"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              if (fieldErrors.price) setFieldErrors((prev) => ({ ...prev, price: undefined }));
            }}
            inputMode="numeric"
            disabled={!isAllowed}
          />
          {fieldErrors.price ? <p className="mt-1 text-xs text-red-600">{fieldErrors.price}</p> : null}
        </div>

        <div>
          <label className="text-sm text-gray-700">Stock quantity</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-3"
            placeholder="How many units do you have now? e.g 25"
            value={stockQty}
            onChange={(e) => {
              setStockQty(e.target.value);
              if (fieldErrors.stockQty) setFieldErrors((prev) => ({ ...prev, stockQty: undefined }));
            }}
            inputMode="numeric"
            disabled={!isAllowed}
          />
          <p className="mt-1 text-xs text-gray-500">This is the total number of units currently available for sale.</p>
          {fieldErrors.stockQty ? <p className="mt-1 text-xs text-red-600">{fieldErrors.stockQty}</p> : null}
        </div>

        <div>
          <label className="text-sm text-gray-700">Category</label>
          <select
            className="mt-1 w-full rounded-xl border px-3 py-3"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              if (fieldErrors.category) setFieldErrors((prev) => ({ ...prev, category: undefined }));
            }}
            disabled={!isAllowed}
            required
          >
            <option value="" disabled>
              Select category
            </option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {fieldErrors.category ? <p className="mt-1 text-xs text-red-600">{fieldErrors.category}</p> : null}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-gray-700">Features</label>
            <p className="text-xs text-gray-500">Optional</p>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Features are key product details buyers check before buying (for example size, color, material, storage).
            You can add multiple values for one feature using comma, for example: Black, White, Orange or 42-45.
          </p>

          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
            <select
              className="w-full rounded-lg border px-2 py-2 text-sm"
              value={featureKey}
              onChange={(e) => setFeatureKey(e.target.value)}
              disabled={!isAllowed}
            >
              <option value="">Select feature</option>
              {featureOptions.map((opt) => (
                <option key={opt.name} value={opt.name}>
                  {opt.name}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded-lg border px-2 py-2 text-sm"
              placeholder={featureKey ? `${getProductFeaturePlaceholder(featureKey)} (comma for multiple)` : "Enter value(s)"}
              value={featureValue}
              onChange={(e) => setFeatureValue(e.target.value)}
              disabled={!isAllowed}
            />
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-xs"
              disabled={!isAllowed || loading}
              onClick={addFeature}
            >
              Add
            </button>
          </div>

          <div className="mt-2 rounded-lg border bg-gray-50 p-2">
            {features.length === 0 ? (
              <p className="text-xs text-gray-500">No feature added yet.</p>
            ) : (
              <div className="space-y-1">
                {features.map((f) => (
                  <div key={f.key} className="flex items-center justify-between rounded-md border bg-white px-2 py-2">
                    <p className="truncate text-sm">
                      <span className="font-medium">{f.key}:</span> {f.value}
                    </p>
                    <button
                      type="button"
                      className="ml-3 rounded-md border px-2 py-1 text-xs text-red-600"
                      disabled={!isAllowed || loading}
                      onClick={() => setFeatures((prev) => prev.filter((x) => x.key !== f.key))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-700">Description</label>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-xs text-gray-500">Optional</p>
            <button
              type="button"
              className="rounded-lg border px-3 py-1 text-xs"
              onClick={onGenerateDescription}
              disabled={!isAllowed || aiLoading || loading}
            >
              {aiLoading ? "Generating..." : "Generate with AI"}
            </button>
          </div>
          <textarea
            className="mt-2 w-full rounded-xl border px-3 py-3"
            placeholder="Short description"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={3}
            disabled={!isAllowed}
          />
          {fieldErrors.description ? <p className="mt-1 text-xs text-red-600">{fieldErrors.description}</p> : null}
        </div>

        <button
          type="button"
          className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
          disabled={!isAllowed || loading}
          onClick={onCreate}
        >
          {loading ? "Creating…" : "Create"}
        </button>
        {fieldErrors.form ? <p className="text-sm text-red-600">{fieldErrors.form}</p> : null}
      </div>
    </div>
  );
}
