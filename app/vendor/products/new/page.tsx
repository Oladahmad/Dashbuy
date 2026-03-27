"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_CATEGORIES, normalizeProductCategory } from "@/lib/productCategories";

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
  const [features, setFeatures] = useState<FeatureField[]>([
    { key: "", value: "" },
    { key: "", value: "" },
    { key: "", value: "" },
  ]);

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
      setFieldErrors({ name: "Enter product name first" });
      return;
    }
    if (!category) {
      setFieldErrors({ category: "Select category first" });
      return;
    }
    if (p === null || p <= 0) {
      setFieldErrors({ price: "Enter price first" });
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
          <label className="text-sm text-gray-700">Image</label>
          <input
            className="mt-2 w-full"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={!isAllowed}
          />
          {fieldErrors.image ? <p className="mt-1 text-xs text-red-600">{fieldErrors.image}</p> : null}
        </div>

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
            placeholder="Enter stock quantity"
            value={stockQty}
            onChange={(e) => {
              setStockQty(e.target.value);
              if (fieldErrors.stockQty) setFieldErrors((prev) => ({ ...prev, stockQty: undefined }));
            }}
            inputMode="numeric"
            disabled={!isAllowed}
          />
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

          <div className="mt-2 space-y-2">
            {features.map((f, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  className="w-full rounded-xl border px-3 py-3"
                  placeholder={idx === 0 ? "e.g Size" : idx === 1 ? "e.g Colour" : "e.g Material"}
                  value={f.key}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], key: e.target.value };
                    setFeatures(next);
                  }}
                  disabled={!isAllowed}
                />
                <input
                  className="w-full rounded-xl border px-3 py-3"
                  placeholder="Enter value"
                  value={f.value}
                  onChange={(e) => {
                    const next = [...features];
                    next[idx] = { ...next[idx], value: e.target.value };
                    setFeatures(next);
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  disabled={!isAllowed}
                />
                <button
                  type="button"
                  className="rounded-xl border px-3 py-3 text-sm"
                  disabled={!isAllowed || loading || features.length <= 1}
                  onClick={() => setFeatures((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label={`Remove feature ${idx + 1}`}
                >
                  -
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="mt-2 rounded-lg border px-3 py-2 text-xs"
            disabled={!isAllowed || loading}
            onClick={() => setFeatures((prev) => [...prev, { key: "", value: "" }])}
          >
            Add more features
          </button>
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
