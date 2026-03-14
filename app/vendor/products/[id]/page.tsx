/* eslint-disable react-hooks/preserve-manual-memoization */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_CATEGORIES, normalizeProductCategory } from "@/lib/productCategories";

type Role = "customer" | "vendor_food" | "vendor_products" | "logistics" | "admin";

type ProductRow = {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  price: number;
  stock_qty: number | null;
  is_available: boolean | null;
  created_at: string | null;
  category: string | null;
  image_path: string | null;
};

function safeNumber(x: unknown, fallback = 0) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const n = Number(x);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toIntOrNull(s: string) {
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v >= 0 ? v : null;
}

function naira(n: number) {
  return `₦${Math.round(Number(n) || 0).toLocaleString()}`;
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function clean(s: string) {
  return s.trim();
}

export default function VendorProductDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");

  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [role, setRole] = useState<Role>("customer");
  const [userId, setUserId] = useState<string | null>(null);

  const [product, setProduct] = useState<ProductRow | null>(null);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [category, setCategory] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const imageUrl = useMemo(() => {
    if (!product?.image_path) return "";
    return (
      supabase.storage
        .from("product-images")
        .getPublicUrl(product.image_path).data.publicUrl || ""
    );
  }, [product?.image_path]);

  const isAllowedRole = role === "vendor_products" || role === "admin";

  const isOwnerOrAdmin = useMemo(() => {
    if (!product || !userId) return false;
    if (role === "admin") return true;
    return product.vendor_id === userId;
  }, [product, userId, role]);

  const canSave = useMemo(() => {
    if (!editing) return false;
    if (!clean(name)) return false;

    const p = toIntOrNull(price);
    if (p === null || p <= 0) return false;

    const q = toIntOrNull(stockQty);
    if (q === null) return false;
    if (!category) return false;

    return true;
  }, [editing, name, price, stockQty, category]);

  async function fileToDataUrl(f: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(f);
    });
  }

  async function onGenerateDescription() {
    setMsg(null);

    const p = toIntOrNull(price);
    const q = toIntOrNull(stockQty);
    if (!clean(name)) return setMsg("Enter product name first");
    if (!category) return setMsg("Select category first");
    if (p === null || p <= 0) return setMsg("Enter price first");

    setAiLoading(true);
    let imageDataUrl = "";
    let imageUrl = "";

    try {
      if (file && file.size <= 2 * 1024 * 1024) {
        imageDataUrl = await fileToDataUrl(file);
      } else if (product?.image_path) {
        imageUrl = supabase.storage.from("product-images").getPublicUrl(product.image_path).data.publicUrl ?? "";
      }
    } catch {
      // Ignore image conversion errors and continue with text context.
    }

    const resp = await fetch("/api/ai/product-description", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: clean(name),
        category: normalizeProductCategory(category),
        price: p,
        stockQty: q ?? 0,
        imageDataUrl: imageDataUrl || undefined,
        imageUrl: imageUrl || undefined,
      }),
    });

    const body = (await resp.json().catch(() => null)) as { ok?: boolean; description?: string; error?: string } | null;
    setAiLoading(false);

    if (!resp.ok || !body?.ok || !body.description) {
      setMsg(body?.error ?? "Failed to generate description");
      return;
    }

    setDesc(body.description);
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg(null);

      const { data: u, error: uErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (uErr || !u?.user) {
        setMsg("Not signed in");
        setLoading(false);
        return;
      }

      setUserId(u.user.id);

      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.user.id)
        .maybeSingle<{ role: Role }>();

      if (!alive) return;

      if (pErr) {
        setMsg(pErr.message);
        setLoading(false);
        return;
      }

      const r = (prof?.role ?? "customer") as Role;
      setRole(r);

      if (!(r === "vendor_products" || r === "admin")) {
        setMsg("You do not have access");
        setLoading(false);
        return;
      }

      if (!id) {
        setMsg("Missing product id");
        setLoading(false);
        return;
      }

      const { data: p, error: prErr } = await supabase
        .from("products")
        .select("id,vendor_id,name,description,price,stock_qty,is_available,created_at,category,image_path")
        .eq("id", id)
        .maybeSingle<ProductRow>();

      if (!alive) return;

      if (prErr) {
        setMsg(prErr.message);
        setProduct(null);
        setLoading(false);
        return;
      }

      if (!p) {
        setMsg("Product not found");
        setProduct(null);
        setLoading(false);
        return;
      }

      if (r !== "admin" && p.vendor_id !== u.user.id) {
        setMsg("You do not have access to this product");
        setProduct(null);
        setLoading(false);
        return;
      }

      setProduct(p);

      setName(p.name ?? "");
      setPrice(String(safeNumber(p.price, 0)));
      setStockQty(String(safeNumber(p.stock_qty, 0)));
      setCategory(normalizeProductCategory(p.category));
      setDesc(p.description ?? "");
      setFile(null);

      setLoading(false);
    }

    load();

    return () => {
      alive = false;
    };
  }, [id]);

  async function toggleAvailability() {
    if (!product) return;
    if (!isOwnerOrAdmin) return;

    setSaving(true);
    setMsg(null);

    const next = !Boolean(product.is_available);

    const { data, error, count } = await supabase
      .from("products")
      .update({ is_available: next }, { count: "exact" })
      .eq("id", product.id)
      .eq("vendor_id", product.vendor_id)
      .select("id,is_available")
      .maybeSingle<{ id: string; is_available: boolean | null }>();

    if (error) {
      setSaving(false);
      setMsg(error.message);
      return;
    }
    if ((count ?? 0) < 1) {
      setSaving(false);
      setMsg("No product updated. You may not have permission for this item.");
      return;
    }

    setProduct((prev) => (prev ? { ...prev, is_available: data?.is_available ?? next } : prev));
    setSaving(false);
  }

  async function saveEdits() {
    if (!product) return;
    if (!isOwnerOrAdmin) return;

    setMsg(null);

    if (!clean(name)) return setMsg("Name is required");

    const p = toIntOrNull(price);
    if (p === null || p <= 0) return setMsg("Enter a valid price");

    const q = toIntOrNull(stockQty);
    if (q === null) return setMsg("Enter a valid stock quantity");
    if (!category) return setMsg("Select a category");

    setSaving(true);

    let nextImagePath: string | null = product.image_path ?? null;

    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `products/${product.vendor_id}/${crypto.randomUUID()}.${ext}`;

      const up = await supabase.storage.from("product-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });

      if (up.error) {
        setSaving(false);
        setMsg(up.error.message);
        return;
      }

      nextImagePath = path;
    }

    const payload: Record<string, unknown> = {
      name: clean(name),
      price: p,
      stock_qty: q,
      category: normalizeProductCategory(category),
      description: clean(desc) ? clean(desc) : null,
      image_path: nextImagePath,
    };

    const { data, error, count } = await supabase
      .from("products")
      .update(payload, { count: "exact" })
      .eq("id", product.id)
      .eq("vendor_id", product.vendor_id)
      .select("id,vendor_id,name,description,price,stock_qty,is_available,created_at,category,image_path")
      .maybeSingle<ProductRow>();

    if (error) {
      setSaving(false);
      setMsg(error.message);
      return;
    }
    if ((count ?? 0) < 1) {
      setSaving(false);
      setMsg("No product updated. You may not have permission for this item.");
      return;
    }
    if (data) {
      setProduct(data);
    } else {
      // Under RLS, update can succeed with empty RETURNING when select policy is restricted.
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              name: clean(name),
              price: p,
              stock_qty: q,
              category: normalizeProductCategory(category),
              description: clean(desc) ? clean(desc) : null,
              image_path: nextImagePath,
            }
          : prev
      );
    }
    setEditing(false);
    setFile(null);
    setSaving(false);
    setMsg("Saved");
    setTimeout(() => setMsg(null), 1200);
  }

  async function deleteProduct() {
    if (!product) return;
    if (!isOwnerOrAdmin) return;

    const yes = window.confirm("Delete this product");
    if (!yes) return;

    setSaving(true);
    setMsg(null);

    const { error, count } = await supabase
      .from("products")
      .delete({ count: "exact" })
      .eq("id", product.id)
      .eq("vendor_id", product.vendor_id);

    if (error) {
      setSaving(false);
      setMsg(error.message);
      return;
    }
    if ((count ?? 0) < 1) {
      setSaving(false);
      setMsg("No product deleted. You may not have permission for this item.");
      return;
    }
    setSaving(false);
    router.push("/vendor/products");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">Product details</p>
          <p className="text-base font-semibold">#{id.slice(0, 8)}</p>
        </div>

        <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={() => router.back()}>
          Back
        </button>
      </div>

      {msg ? <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">{msg}</div> : null}

      {loading ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">Loading…</div>
      ) : !isAllowedRole ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-red-600">You do not have access</div>
      ) : !product ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-gray-600">No product</div>
      ) : (
        <>
          <div className="rounded-2xl border bg-white overflow-hidden">
            <div className="w-full aspect-square bg-gray-100">
              {imageUrl ? <img src={imageUrl} alt={product.name} className="h-full w-full object-cover" /> : null}
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold truncate">{product.name}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Created {product.created_at ? fmtDateTime(product.created_at) : "unknown"}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-base font-semibold">{naira(safeNumber(product.price, 0))}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {product.is_available ? "Available" : "Not available"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border p-3">
                  <p className="text-xs text-gray-600">Stock</p>
                  <p className="text-base font-semibold">{safeNumber(product.stock_qty, 0)}</p>
                </div>

                <div className="rounded-xl border p-3">
                  <p className="text-xs text-gray-600">Category</p>
                  <p className="text-sm">{normalizeProductCategory(product.category)}</p>
                </div>
              </div>

              <div className="rounded-xl border p-3">
                <p className="text-xs text-gray-600">Description</p>
                <p className="text-sm whitespace-pre-wrap">
                  {(product.description ?? "").trim() ? product.description : "No description"}
                </p>
              </div>
            </div>
          </div>

          {isOwnerOrAdmin ? (
            <div className="rounded-2xl border bg-white p-4 space-y-3">
              <p className="text-base font-semibold">Vendor actions</p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
                  onClick={toggleAvailability}
                  disabled={saving}
                >
                  {saving ? "Saving…" : product.is_available ? "Disable" : "Enable"}
                </button>

                <button
                  type="button"
                  className="rounded-xl border px-4 py-3 disabled:opacity-50"
                  onClick={() => {
                    setMsg(null);
                    setEditing((v) => !v);
                    setFile(null);
                    if (!editing) {
                      setName(product.name ?? "");
                      setPrice(String(safeNumber(product.price, 0)));
                      setStockQty(String(safeNumber(product.stock_qty, 0)));
                      setCategory(normalizeProductCategory(product.category));
                      setDesc(product.description ?? "");
                    }
                  }}
                  disabled={saving}
                >
                  {editing ? "Close edit" : "Edit"}
                </button>
              </div>

              {editing ? (
                <div className="rounded-2xl border p-4 space-y-3">
                  <div>
                    <label className="text-sm text-gray-700">Name</label>
                    <input
                      className="mt-1 w-full rounded-xl border px-3 py-3"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-700">Price</label>
                    <input
                      className="mt-1 w-full rounded-xl border px-3 py-3"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      inputMode="numeric"
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-700">Stock quantity</label>
                    <input
                      className="mt-1 w-full rounded-xl border px-3 py-3"
                      value={stockQty}
                      onChange={(e) => setStockQty(e.target.value)}
                      inputMode="numeric"
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-700">Category</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-3 py-3"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      disabled={saving}
                      required
                    >
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
                        disabled={saving || aiLoading}
                      >
                        {aiLoading ? "Generating..." : "Generate with AI"}
                      </button>
                    </div>
                    <textarea
                      className="mt-2 w-full rounded-xl border px-3 py-3"
                      rows={3}
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <label className="text-sm text-gray-700">Replace image</label>
                    <input
                      className="mt-2 w-full"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      disabled={saving}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
                      onClick={saveEdits}
                      disabled={saving || !canSave}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>

                    <button
                      type="button"
                      className="rounded-xl border px-4 py-3 text-red-600 disabled:opacity-50"
                      onClick={deleteProduct}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
