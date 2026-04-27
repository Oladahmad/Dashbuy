import { CATEGORY_HINTS, PLATFORM_CATEGORY_LABELS, SIZE_KEYWORDS, type PlatformFoodCategory } from "./constants";
import type { MenuImportCategoryDraft, MenuImportDraft, MenuImportItemDraft, ParsedMenuItem } from "./types";

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function slugify(value: string) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeName(value: string) {
  return slugify(value).replace(/-(small|medium|large|big|jumbo|family|mini|regular)$/, "");
}

export function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function clampConfidence(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 0.5;
  return Math.max(0, Math.min(1, Number(value)));
}

export function parsePrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = cleanText(value);
  if (!text) return null;
  const matched = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!matched) return null;
  const num = Number(matched[1]);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : null;
}

export function buildDescription(notes: string, addOns: string[]) {
  const parts = [cleanText(notes)];
  if (addOns.length > 0) parts.push(`Add-ons: ${addOns.join(", ")}`);
  return parts.filter(Boolean).join(" ");
}

export function detectSizeKeyword(value: string) {
  const lower = cleanText(value).toLowerCase();
  return SIZE_KEYWORDS.find((term) => lower.includes(term)) ?? null;
}

function inferPlatformCategoryLocal(name: string, rawCategory: string) {
  const haystack = `${cleanText(name)} ${cleanText(rawCategory)}`.toLowerCase();
  for (const entry of CATEGORY_HINTS) {
    if (entry.terms.some((term) => haystack.includes(term))) return entry.category;
  }
  return "main" satisfies PlatformFoodCategory;
}

function inferDisplayCategoryLocal(platformCategory: PlatformFoodCategory) {
  return PLATFORM_CATEGORY_LABELS[platformCategory];
}

export function detectPricingType(item: ParsedMenuItem): MenuImportItemDraft["pricingType"] {
  if (item.foodType === "combo") return "fixed";
  if (item.variants.length > 0) return "variant";
  const unitLabel = cleanText(item.unitLabel).toLowerCase();
  if (unitLabel.includes("scoop")) return "per_scoop";
  if (unitLabel.includes("piece") || unitLabel.includes("unit")) return "per_unit";
  return item.pricingType;
}

export function groupDraftIntoCategories(items: ParsedMenuItem[], sourceSummary: string, warnings: MenuImportDraft["warnings"]) {
  const categories = new Map<string, MenuImportCategoryDraft>();

  for (const item of items) {
    const platformCategory = item.platformCategory ?? inferPlatformCategoryLocal(item.name, item.categoryName);
    const categoryName = cleanText(item.categoryName) || inferDisplayCategoryLocal(platformCategory);
    const categoryKey = slugify(categoryName) || platformCategory;
    const draftItem: MenuImportItemDraft = {
      id: makeId("item"),
      name: cleanText(item.name),
      description: cleanText(item.description) || buildDescription(item.notes, item.addOns),
      notes: cleanText(item.notes),
      categoryName,
      platformCategory,
      foodType: item.foodType,
      pricingType: detectPricingType(item),
      price: parsePrice(item.price),
      unitLabel: cleanText(item.unitLabel) || null,
      variants: item.variants.map((variant) => ({
        id: makeId("variant"),
        name: cleanText(variant.name),
        size: cleanText(variant.size) || detectSizeKeyword(variant.name),
        price: parsePrice(variant.price) ?? 0,
        notes: cleanText(variant.notes) || null,
      })),
      comboParts: item.comboParts.map(cleanText).filter(Boolean),
      addOns: item.addOns.map(cleanText).filter(Boolean),
      imageUrl: "",
      imageSource: "none",
      sourceConfidence: clampConfidence(item.sourceConfidence),
      duplicateKey: normalizeName(item.name),
      lowConfidence: clampConfidence(item.sourceConfidence) < 0.6,
    };

    const existing =
      categories.get(categoryKey) ??
      {
        id: makeId("category"),
        name: categoryName,
        inferred: cleanText(item.categoryName).length === 0,
        items: [],
      };

    existing.items.push(draftItem);
    categories.set(categoryKey, existing);
  }

  return {
    sourceSummary,
    categories: Array.from(categories.values()),
    warnings,
  } satisfies MenuImportDraft;
}

export function flattenDraftItems(draft: MenuImportDraft) {
  return draft.categories.flatMap((category) => category.items.map((item) => ({ category, item })));
}

export function detectDuplicateWarnings(draft: MenuImportDraft) {
  const seen = new Map<string, string[]>();
  for (const { item } of flattenDraftItems(draft)) {
    if (!item.duplicateKey) continue;
    seen.set(item.duplicateKey, [...(seen.get(item.duplicateKey) ?? []), item.name]);
  }

  return Array.from(seen.entries())
    .filter(([, names]) => names.length > 1)
    .map(([key, names]) => ({
      code: "duplicate_menu_items",
      severity: "medium" as const,
      message: `Potential duplicate detected for ${key.replace(/-/g, " ")}: ${names.join(", ")}`,
    }));
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 2) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Operation failed");
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => run());
  await Promise.all(runners);
  return results;
}

export function extensionFromMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("wordprocessingml")) return "docx";
  return "jpg";
}
