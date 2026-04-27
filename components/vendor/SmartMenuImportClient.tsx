"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { MenuImportDraft, MenuImportItemDraft } from "@/lib/menu-import/types";

function flattenItems(draft: MenuImportDraft) {
  return draft.categories.flatMap((category) => category.items.map((item) => ({ categoryId: category.id, item })));
}

function mergeDuplicateItems(draft: MenuImportDraft) {
  const clone: MenuImportDraft = {
    ...draft,
    categories: draft.categories.map((category) => ({
      ...category,
      items: [...category.items],
    })),
  };

  const seen = new Map<string, MenuImportItemDraft>();
  for (const category of clone.categories) {
    const nextItems: MenuImportItemDraft[] = [];
    for (const item of category.items) {
      const existing = seen.get(item.duplicateKey);
      if (!existing) {
        seen.set(item.duplicateKey, item);
        nextItems.push(item);
        continue;
      }
      existing.variants = [...existing.variants, ...item.variants];
      existing.comboParts = Array.from(new Set([...existing.comboParts, ...item.comboParts]));
      existing.addOns = Array.from(new Set([...existing.addOns, ...item.addOns]));
      if (!existing.imageUrl && item.imageUrl) existing.imageUrl = item.imageUrl;
      existing.sourceConfidence = Math.max(existing.sourceConfidence, item.sourceConfidence);
    }
    category.items = nextItems;
  }
  return clone;
}

function regroupCategories(draft: MenuImportDraft): MenuImportDraft {
  const grouped = new Map<string, MenuImportDraft["categories"][number]>();

  for (const category of draft.categories) {
    for (const item of category.items) {
      const key = item.categoryName.trim().toLowerCase() || category.name.trim().toLowerCase() || category.id;
      const existing = grouped.get(key) ?? {
        id: category.id,
        name: item.categoryName.trim() || category.name,
        inferred: category.inferred,
        items: [],
      };
      existing.name = item.categoryName.trim() || existing.name;
      existing.items.push(item);
      grouped.set(key, existing);
    }
  }

  return {
    ...draft,
    categories: Array.from(grouped.values()),
  };
}

export default function SmartMenuImportClient() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<MenuImportDraft | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const totalItems = useMemo(() => (draft ? flattenItems(draft).length : 0), [draft]);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setProgress(0);
    setMessage("Uploading menu file and extracting items...");

    const token = await getAccessToken();
    if (!token) {
      setUploading(false);
      setMessage("Please sign in again before importing a menu.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/vendor/menu-import");
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.min(95, Math.round((event.loaded / event.total) * 100)));
        }
      };
      xhr.onload = () => {
        setUploading(false);
        setProgress(100);
        const body = JSON.parse(xhr.responseText || "{}") as {
          ok?: boolean;
          error?: string;
          sessionId?: string;
          draft?: MenuImportDraft;
        };
        if (xhr.status >= 200 && xhr.status < 300 && body.ok && body.draft && body.sessionId) {
          setDraft(body.draft);
          setSessionId(body.sessionId);
          setMessage("Menu extracted. Review everything below before publishing.");
        } else {
          setMessage(body.error ?? "Menu import failed.");
        }
        resolve();
      };
      xhr.onerror = () => {
        setUploading(false);
        setMessage("Network error while uploading the menu.");
        resolve();
      };
      xhr.send(formData);
    });
  }

  function onFileChange(file: File | null) {
    if (!file) return;
    void uploadFile(file);
  }

  function updateItem(itemId: string, updater: (item: MenuImportItemDraft) => MenuImportItemDraft) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        categories: current.categories.map((category) => ({
          ...category,
          items: category.items.map((item) => (item.id === itemId ? updater(item) : item)),
        })),
      };
    });
  }

  function removeItem(itemId: string) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        categories: current.categories
          .map((category) => ({
            ...category,
            items: category.items.filter((item) => item.id !== itemId),
          }))
          .filter((category) => category.items.length > 0),
      };
    });
  }

  async function saveReview() {
    if (!draft || !sessionId) return;
    setSaving(true);
    setMessage(null);
    const token = await getAccessToken();
    const response = await fetch(`/api/vendor/menu-import/${sessionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ draft }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; draft?: MenuImportDraft } | null;
    setSaving(false);
    if (response.ok && body?.draft) setDraft(body.draft);
    setMessage(response.ok && body?.ok ? "Review draft saved." : body?.error ?? "Could not save review draft.");
  }

  async function publishMenu() {
    if (!draft || !sessionId) return;
    setPublishing(true);
    setMessage(null);
    const token = await getAccessToken();
    const response = await fetch(`/api/vendor/menu-import/${sessionId}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ draft }),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setPublishing(false);
    if (response.ok && body?.ok) {
      setMessage("Menu published successfully.");
      router.push("/vendor/food");
      return;
    }
    setMessage(body?.error ?? "Could not publish menu.");
  }

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          className="rounded-xl border bg-white px-4 py-2 text-sm"
          onClick={() => router.push("/vendor/food")}
        >
          Back to foods
        </button>
      </div>

      <div className="rounded-3xl border bg-white p-5">
        <p className="text-sm text-gray-600">Import Menu with AI</p>
        <h1 className="mt-1 text-xl font-semibold">Upload a menu sheet, scan, PDF, or food photo</h1>
        <p className="mt-2 text-sm text-gray-600">
          Supported formats: JPG, PNG, WEBP, PDF, and DOCX. Dashbuy will extract categories, prices, variants, combos, and images for review.
        </p>

        <label
          className={`mt-4 block rounded-3xl border-2 border-dashed p-8 text-center transition ${
            dragging ? "border-black bg-gray-50" : "border-gray-300"
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onFileChange(event.dataTransfer.files?.[0] ?? null);
          }}
        >
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.docx"
            className="hidden"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            disabled={uploading}
          />
          <p className="text-base font-medium">{uploading ? "Processing your menu..." : "Drag and drop your menu here"}</p>
          <p className="mt-2 text-sm text-gray-600">Or tap to choose a file from your device.</p>
        </label>

        {(uploading || progress > 0) && (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-black transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-sm text-gray-600">{progress}%</p>
          </div>
        )}

        {message ? <p className="mt-4 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700">{message}</p> : null}
      </div>

      {draft ? (
        <div className="rounded-3xl border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-600">Human review</p>
              <p className="text-lg font-semibold">{totalItems} extracted menu item{totalItems === 1 ? "" : "s"}</p>
              <p className="mt-1 text-xs text-gray-500">{draft.sourceSummary}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm"
                onClick={() => setDraft((current) => (current ? mergeDuplicateItems(current) : current))}
              >
                Merge duplicates
              </button>
              <button
                type="button"
                className="rounded-xl border px-4 py-2 text-sm"
                onClick={() => setDraft((current) => (current ? regroupCategories(current) : current))}
              >
                Regroup categories
              </button>
              <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={saveReview} disabled={saving}>
                {saving ? "Saving..." : "Save draft"}
              </button>
              <button
                type="button"
                className="rounded-xl bg-black px-4 py-2 text-sm text-white"
                onClick={publishMenu}
                disabled={publishing}
              >
                {publishing ? "Publishing..." : "Approve and publish"}
              </button>
            </div>
          </div>

          {draft.warnings.length > 0 ? (
            <div className="mt-4 space-y-2">
              {draft.warnings.map((warning, index) => (
                <div key={`${warning.code}-${index}`} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {warning.message}
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-5 space-y-5">
            {draft.categories.map((category) => (
              <section key={category.id} className="rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{category.name}</p>
                    <p className="text-xs text-gray-600">{category.inferred ? "Inferred category" : "Detected from source"}</p>
                  </div>
                  <p className="text-sm text-gray-500">{category.items.length} item{category.items.length === 1 ? "" : "s"}</p>
                </div>

                <div className="mt-4 space-y-3">
                  {category.items.map((item) => (
                    <div key={item.id} className="rounded-2xl border bg-gray-50 p-4">
                      <div className="grid gap-4 lg:grid-cols-[120px_1fr]">
                        <div>
                          <div className="h-28 overflow-hidden rounded-2xl bg-white">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-gray-400">No image</div>
                            )}
                          </div>
                          <input
                            className="mt-2 w-full rounded-xl border bg-white px-3 py-2 text-xs"
                            placeholder="Replace image URL"
                            value={item.imageUrl}
                            onChange={(event) => updateItem(item.id, (current) => ({ ...current, imageUrl: event.target.value }))}
                          />
                        </div>

                        <div className="grid gap-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input
                              className="rounded-xl border bg-white px-3 py-2 text-sm"
                              value={item.name}
                              onChange={(event) => updateItem(item.id, (current) => ({ ...current, name: event.target.value }))}
                            />
                            <input
                              className="rounded-xl border bg-white px-3 py-2 text-sm"
                              value={item.categoryName}
                              onChange={(event) => updateItem(item.id, (current) => ({ ...current, categoryName: event.target.value }))}
                            />
                          </div>

                          <textarea
                            className="rounded-xl border bg-white px-3 py-2 text-sm"
                            rows={2}
                            value={item.description}
                            onChange={(event) => updateItem(item.id, (current) => ({ ...current, description: event.target.value }))}
                          />

                          <div className="grid gap-2 sm:grid-cols-4">
                            <select
                              className="rounded-xl border bg-white px-3 py-2 text-sm"
                              value={item.foodType}
                              onChange={(event) =>
                                updateItem(item.id, (current) => ({ ...current, foodType: event.target.value as MenuImportItemDraft["foodType"] }))
                              }
                            >
                              <option value="single">Single</option>
                              <option value="combo">Combo</option>
                            </select>
                            <select
                              className="rounded-xl border bg-white px-3 py-2 text-sm"
                              value={item.pricingType}
                              onChange={(event) =>
                                updateItem(item.id, (current) => ({ ...current, pricingType: event.target.value as MenuImportItemDraft["pricingType"] }))
                              }
                            >
                              <option value="fixed">Fixed</option>
                              <option value="per_scoop">Per scoop</option>
                              <option value="per_unit">Per unit</option>
                              <option value="variant">Variant</option>
                            </select>
                            <input
                              className="rounded-xl border bg-white px-3 py-2 text-sm"
                              inputMode="numeric"
                              value={item.price ?? ""}
                              onChange={(event) => updateItem(item.id, (current) => ({ ...current, price: Number(event.target.value || 0) }))}
                              placeholder="Price"
                            />
                            <input
                              className="rounded-xl border bg-white px-3 py-2 text-sm"
                              value={item.unitLabel ?? ""}
                              onChange={(event) => updateItem(item.id, (current) => ({ ...current, unitLabel: event.target.value || null }))}
                              placeholder="Unit label"
                            />
                          </div>

                          {item.variants.length > 0 ? (
                            <div className="rounded-2xl border bg-white p-3">
                              <p className="text-xs font-medium text-gray-600">Variants</p>
                              <div className="mt-2 space-y-2">
                                {item.variants.map((variant) => (
                                  <div key={variant.id} className="grid gap-2 sm:grid-cols-3">
                                    <input
                                      className="rounded-xl border px-3 py-2 text-sm"
                                      value={variant.name}
                                      onChange={(event) =>
                                        updateItem(item.id, (current) => ({
                                          ...current,
                                          variants: current.variants.map((entry) =>
                                            entry.id === variant.id ? { ...entry, name: event.target.value } : entry
                                          ),
                                        }))
                                      }
                                    />
                                    <input
                                      className="rounded-xl border px-3 py-2 text-sm"
                                      value={variant.size ?? ""}
                                      onChange={(event) =>
                                        updateItem(item.id, (current) => ({
                                          ...current,
                                          variants: current.variants.map((entry) =>
                                            entry.id === variant.id ? { ...entry, size: event.target.value || null } : entry
                                          ),
                                        }))
                                      }
                                    />
                                    <input
                                      className="rounded-xl border px-3 py-2 text-sm"
                                      inputMode="numeric"
                                      value={variant.price}
                                      onChange={(event) =>
                                        updateItem(item.id, (current) => ({
                                          ...current,
                                          variants: current.variants.map((entry) =>
                                            entry.id === variant.id ? { ...entry, price: Number(event.target.value || 0) } : entry
                                          ),
                                        }))
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-2">
                            {item.lowConfidence ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">Low confidence OCR</span> : null}
                            {item.imageSource !== "none" ? (
                              <span className="rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-700">
                                Image: {item.imageSource === "search" ? "Google search" : "Generated"}
                              </span>
                            ) : null}
                            <button type="button" className="rounded-full border px-3 py-1 text-xs" onClick={() => removeItem(item.id)}>
                              Remove item
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
