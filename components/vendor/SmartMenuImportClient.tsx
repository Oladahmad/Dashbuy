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

function fileExt(name: string) {
  const index = name.lastIndexOf(".");
  if (index < 0) return "jpg";
  return name.slice(index + 1).toLowerCase();
}

function nowId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
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

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

function formatPrice(value: number | null) {
  if (!value || value <= 0) return "Needs price";
  return nairaFormatter.format(value);
}

function getPricingSummary(item: MenuImportItemDraft) {
  if (item.pricingType === "variant") return `${item.variants.length} variant${item.variants.length === 1 ? "" : "s"}`;
  if (item.pricingType === "per_scoop") return `${formatPrice(item.price)} per scoop`;
  if (item.pricingType === "per_unit") return `${formatPrice(item.price)} per ${item.unitLabel?.trim() || "unit"}`;
  return formatPrice(item.price);
}

function isDuplicateVariantLabel(name: string, size: string | null) {
  if (!size) return false;
  return name.trim().toLowerCase() === size.trim().toLowerCase();
}

function getReviewCount(draft: MenuImportDraft | null) {
  if (!draft) return 0;
  return flattenItems(draft).filter(({ item }) => item.lowConfidence || (!item.imageUrl && item.imageSource === "none")).length;
}

function getImportantWarnings(draft: MenuImportDraft | null) {
  if (!draft) return [];
  return draft.warnings.filter((warning) => warning.severity === "high");
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
  const [publishState, setPublishState] = useState<"idle" | "publishing" | "published">("idle");
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null);

  const totalItems = useMemo(() => (draft ? flattenItems(draft).length : 0), [draft]);
  const reviewCount = useMemo(() => getReviewCount(draft), [draft]);
  const importantWarnings = useMemo(() => getImportantWarnings(draft), [draft]);

  async function getAccessToken() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) {
      return sessionData.session.access_token;
    }

    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session?.access_token ?? "";
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
            const extractedCount = flattenItems(body.draft).length;
            const nextWarnings = getImportantWarnings(body.draft);
          if (extractedCount === 0 && nextWarnings.length > 0) {
            setMessage(nextWarnings[0]?.message ?? "Menu import could not extract any items.");
          } else if (extractedCount === 0) {
            setMessage("Menu import finished, but no menu items were extracted.");
          } else {
            setMessage("Menu extracted. Review everything below before publishing.");
          }
          } else {
            setMessage(xhr.status === 401 ? "Your session expired. Please sign in again and retry." : body.error ?? "Menu import failed.");
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

  async function uploadItemImage(itemId: string, file: File) {
    setUploadingImageFor(itemId);
    setMessage(null);

    const { data: auth } = await supabase.auth.getUser();
    const vendorId = auth.user?.id;
    if (!vendorId) {
      setUploadingImageFor(null);
      setMessage("Please sign in again before adding images.");
      return;
    }

    const ext = fileExt(file.name);
    const path = `vendors/${vendorId}/foods/import-${nowId()}.${ext}`;
    const upload = await supabase.storage.from("food-images").upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

    if (upload.error) {
      setUploadingImageFor(null);
      setMessage("Could not upload image: " + upload.error.message);
      return;
    }

    const publicUrl = supabase.storage.from("food-images").getPublicUrl(path).data.publicUrl;
    if (!publicUrl) {
      setUploadingImageFor(null);
      setMessage("Image uploaded but the public URL could not be created.");
      return;
    }

    updateItem(itemId, (current) => ({
      ...current,
      imageUrl: publicUrl,
      imageSource: "none",
    }));
    setUploadingImageFor(null);
    setMessage("Image added.");
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
    setMessage(
      response.ok && body?.ok
        ? "Review draft saved."
        : response.status === 401
          ? "Your session expired. Please sign in again and retry."
          : body?.error ?? "Could not save review draft."
    );
  }

  async function publishMenu() {
    if (!draft || !sessionId) return;
    setPublishing(true);
    setPublishState("publishing");
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
      setPublishState("published");
      setMessage("Menu published successfully.");
      window.setTimeout(() => {
        router.push("/vendor/food");
      }, 1400);
      return;
    }
    setPublishState("idle");
    setMessage(response.status === 401 ? "Your session expired. Please sign in again and retry." : body?.error ?? "Could not publish menu.");
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
        <div className="space-y-4 pb-24">
          {publishState !== "idle" ? (
            <div className="rounded-3xl border bg-white p-5">
              <div className="flex items-center gap-3">
                {publishState === "publishing" ? (
                  <>
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
                    <div>
                      <p className="text-sm text-gray-600">Publishing</p>
                      <p className="font-semibold text-gray-900">Publishing your menu items now...</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                      ✓
                    </div>
                    <div>
                      <p className="text-sm text-emerald-700">Published</p>
                      <p className="font-semibold text-gray-900">Menu published successfully. Redirecting to your food list...</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-3xl border bg-white p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm text-gray-600">Human review</p>
                <p className="text-lg font-semibold">{totalItems} extracted menu item{totalItems === 1 ? "" : "s"}</p>
                <p className="mt-1 text-sm text-gray-500">{draft.sourceSummary}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:flex sm:flex-wrap">
                <div className="rounded-2xl bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500">Categories</p>
                  <p className="font-semibold text-gray-900">{draft.categories.length}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500">Check items</p>
                  <p className="font-semibold text-gray-900">{reviewCount}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
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
            </div>
          </div>

          {importantWarnings.length > 0 ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">Review notes</p>
              <div className="mt-3 space-y-2">
                {importantWarnings.map((warning, index) => (
                  <p key={`${warning.code}-${index}`} className="text-sm text-amber-900">
                    {warning.message}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          <div className="space-y-5">
            {draft.categories.map((category) => (
              <section key={category.id} className="rounded-3xl border bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{category.name}</p>
                    <p className="text-xs text-gray-600">{category.inferred ? "Suggested category" : "Detected from source"}</p>
                  </div>
                  <p className="text-sm text-gray-500">{category.items.length} item{category.items.length === 1 ? "" : "s"}</p>
                </div>

                <div className="mt-4 space-y-3">
                  {category.items.map((item) => (
                    <div key={item.id} className="rounded-3xl border bg-gray-50 p-4">
                      <div className="grid gap-4 lg:grid-cols-[112px_1fr]">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="h-20 w-20 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
                              {item.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full items-center justify-center text-[11px] text-gray-400">No image</div>
                              )}
                            </div>
                            <label className="inline-flex cursor-pointer items-center rounded-xl border bg-white px-3 py-2 text-sm font-medium text-gray-700">
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(event) => {
                                  const file = event.target.files?.[0] ?? null;
                                  if (file) void uploadItemImage(item.id, file);
                                  event.currentTarget.value = "";
                                }}
                                disabled={uploadingImageFor === item.id}
                              />
                              {uploadingImageFor === item.id ? "Uploading..." : item.imageUrl ? "Change image" : "Add image"}
                            </label>
                          </div>
                        </div>

                        <div className="grid gap-3">
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700">{getPricingSummary(item)}</span>
                            {item.lowConfidence ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">Check OCR</span> : null}
                            {!item.imageUrl ? <span className="rounded-full bg-gray-200 px-3 py-1 text-xs text-gray-700">No image</span> : null}
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <input
                              className="min-w-0 rounded-xl border bg-white px-3 py-2 text-sm"
                              value={item.name}
                              placeholder="Item name"
                              onChange={(event) => updateItem(item.id, (current) => ({ ...current, name: event.target.value }))}
                            />
                            <input
                              className="min-w-0 rounded-xl border bg-white px-3 py-2 text-sm"
                              value={item.categoryName}
                              placeholder="Category"
                              onChange={(event) => updateItem(item.id, (current) => ({ ...current, categoryName: event.target.value }))}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {item.pricingType !== "variant" ? (
                              <input
                                className="min-w-0 rounded-xl border bg-white px-3 py-2 text-sm"
                                inputMode="numeric"
                                value={item.price ?? ""}
                                onChange={(event) =>
                                  updateItem(item.id, (current) => ({
                                    ...current,
                                    price: event.target.value ? Number(event.target.value) : null,
                                  }))
                                }
                                placeholder="Price"
                              />
                            ) : (
                              <div className="min-w-0 rounded-xl bg-white px-3 py-2 text-sm text-gray-500">Price comes from variants</div>
                            )}
                            {item.pricingType === "per_unit" ? (
                              <input
                                className="min-w-0 rounded-xl border bg-white px-3 py-2 text-sm"
                                value={item.unitLabel ?? ""}
                                onChange={(event) => updateItem(item.id, (current) => ({ ...current, unitLabel: event.target.value || null }))}
                                placeholder="Unit"
                              />
                            ) : item.pricingType === "per_scoop" ? (
                              <div className="min-w-0 rounded-xl bg-white px-3 py-2 text-sm text-gray-500">Per scoop</div>
                            ) : (
                              <div className="min-w-0 rounded-xl bg-white px-3 py-2 text-sm text-gray-400">
                                {item.pricingType === "variant" ? "Edit sizes below" : "No unit"}
                              </div>
                            )}
                          </div>

                          {item.variants.length > 0 ? (
                            <div className="rounded-2xl border bg-white p-3">
                              <p className="text-xs font-medium text-gray-600">Variants</p>
                              <div className="mt-2 space-y-2">
                                {item.variants.map((variant) => (
                                  <div key={variant.id} className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                                    <input
                                      className="min-w-0 rounded-xl border px-3 py-2 text-sm"
                                      value={isDuplicateVariantLabel(variant.name, variant.size) ? variant.size ?? variant.name : variant.name}
                                      placeholder="Option"
                                      onChange={(event) =>
                                        updateItem(item.id, (current) => ({
                                          ...current,
                                          variants: current.variants.map((entry) =>
                                            entry.id === variant.id
                                              ? isDuplicateVariantLabel(entry.name, entry.size)
                                                ? { ...entry, name: event.target.value, size: event.target.value || null }
                                                : { ...entry, name: event.target.value }
                                              : entry
                                          ),
                                        }))
                                      }
                                    />
                                    <input
                                      className="min-w-0 rounded-xl border px-3 py-2 text-sm"
                                      inputMode="numeric"
                                      value={variant.price}
                                      placeholder="Price"
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

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700"
                              onClick={() => removeItem(item.id)}
                            >
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

          <div className="sticky bottom-4 z-10">
            <div className="rounded-3xl border bg-white/95 p-3 shadow-lg backdrop-blur">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" className="rounded-xl border px-4 py-3 text-sm sm:flex-1" onClick={saveReview} disabled={saving}>
                  {saving ? "Saving..." : "Save draft"}
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-black px-4 py-3 text-sm text-white sm:flex-1"
                  onClick={publishMenu}
                  disabled={publishing || publishState !== "idle"}
                >
                  {publishing ? "Publishing..." : "Approve and publish"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
