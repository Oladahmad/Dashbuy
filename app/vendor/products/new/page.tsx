"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_CATEGORIES, normalizeProductCategory } from "@/lib/productCategories";

type Role = "customer" | "vendor_food" | "vendor_products" | "admin";

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
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

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
    setErr(null);

    const p = toIntOrNull(price);
    const q = toIntOrNull(stockQty);

    if (!name.trim()) {
      setErr("Enter product name first");
      return;
    }
    if (!category) {
      setErr("Select category first");
      return;
    }
    if (p === null || p <= 0) {
      setErr("Enter price first");
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

    const resp = await fetch("/api/ai/product-description", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        category: normalizeProductCategory(category),
        price: p,
        stockQty: q ?? 0,
        imageDataUrl: imageDataUrl || undefined,
      }),
    });

    const body = (await resp.json().catch(() => null)) as { ok?: boolean; description?: string; error?: string } | null;
    setAiLoading(false);

    if (!resp.ok || !body?.ok || !body.description) {
      setErr(body?.error ?? "Failed to generate description");
      return;
    }

    setDesc(body.description);
  }

  async function onCreate() {
    setErr(null);

    const p = toIntOrNull(price);
    const q = toIntOrNull(stockQty);

    if (!isAllowed) {
      setErr("You do not have access");
      return;
    }
    if (!file) {
      setErr("Please choose an image");
      return;
    }
    if (!name.trim()) {
      setErr("Please enter a name");
      return;
    }
    if (p === null || p <= 0) {
      setErr("Please enter a valid price");
      return;
    }
    if (!category) {
      setErr("Please select a category");
      return;
    }

    setLoading(true);

    const { data: u } = await supabase.auth.getUser();
    const user = u.user;

    if (!user) {
      setLoading(false);
      setErr("Not signed in");
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
      setErr(up.error.message);
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
      setErr(ins.error.message);
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

      {err ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{err}</div> : null}

      <div className="rounded-2xl border bg-white p-4 space-y-3">
        <div>
          <label className="text-sm text-gray-700">Name</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-3"
            placeholder="Product name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAllowed}
          />
        </div>

        <div>
          <label className="text-sm text-gray-700">Price</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-3"
            placeholder="Enter price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="numeric"
            disabled={!isAllowed}
          />
        </div>

        <div>
          <label className="text-sm text-gray-700">Stock quantity</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-3"
            placeholder="Enter stock quantity"
            value={stockQty}
            onChange={(e) => setStockQty(e.target.value)}
            inputMode="numeric"
            disabled={!isAllowed}
          />
        </div>

        <div>
          <label className="text-sm text-gray-700">Category</label>
          <select
            className="mt-1 w-full rounded-xl border px-3 py-3"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
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
        </div>

        <div>
          <label className="text-sm text-gray-700">Image</label>
          <input
            className="mt-2 w-full"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={!isAllowed}
          />
        </div>

        <button
          type="button"
          className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
          disabled={!isAllowed || loading}
          onClick={onCreate}
        >
          {loading ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}
