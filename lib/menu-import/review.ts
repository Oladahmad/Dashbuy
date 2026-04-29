import type { MenuImportCategoryDraft, MenuImportDraft, MenuImportItemDraft } from "./types";
import { inferBestCategory } from "./category";
import { buildDescription, clampConfidence, detectDuplicateWarnings, detectPricingType, normalizeName, parsePrice, slugify } from "./utils";

const CATEGORY_REVIEW_ORDER = ["rice-dishes", "proteins", "swallow", "soups", "sides", "pasta", "drinks", "extras", "main"];

function normalizeItem(item: MenuImportItemDraft): MenuImportItemDraft {
  const category = inferBestCategory(item.name, item.categoryName);
  const variants = (item.variants ?? [])
    .map((variant) => ({
      ...variant,
      name: variant.name.trim(),
      size: variant.size?.trim() || null,
      price: parsePrice(variant.price) ?? 0,
      notes: variant.notes?.trim() || null,
    }))
    .filter((variant) => variant.name && variant.price > 0)
    .sort((a, b) => a.price - b.price);

  const normalized: MenuImportItemDraft = {
    ...item,
    name: item.name.trim(),
    description: item.description.trim() || buildDescription(item.notes, item.addOns),
    notes: item.notes.trim(),
    categoryName: category.categoryName,
    platformCategory: category.platformCategory,
    pricingType: detectPricingType({
      categoryName: category.categoryName,
      platformCategory: category.platformCategory,
      name: item.name.trim(),
      description: item.description.trim(),
      notes: item.notes.trim(),
      foodType: item.foodType,
      pricingType: item.pricingType,
      variants,
      comboParts: (item.comboParts ?? []).map((part) => part.trim()).filter(Boolean),
      addOns: (item.addOns ?? []).map((part) => part.trim()).filter(Boolean),
      price: parsePrice(item.price),
      unitLabel: item.unitLabel?.trim() || null,
      sourceConfidence: clampConfidence(item.sourceConfidence),
    }),
    price: parsePrice(item.price),
    unitLabel: item.unitLabel?.trim() || null,
    variants,
    comboParts: (item.comboParts ?? []).map((part) => part.trim()).filter(Boolean),
    addOns: (item.addOns ?? []).map((part) => part.trim()).filter(Boolean),
    imageUrl: item.imageUrl.trim(),
    sourceConfidence: clampConfidence(item.sourceConfidence),
    duplicateKey: normalizeName(item.name.trim()) || item.duplicateKey,
    lowConfidence: clampConfidence(item.sourceConfidence) < 0.6,
  };

  if (normalized.pricingType === "variant") normalized.price = null;
  return normalized;
}

function getDraftQualityWarnings(categories: MenuImportCategoryDraft[]) {
  const warnings: MenuImportDraft["warnings"] = [];

  for (const category of categories) {
    for (const item of category.items) {
      if (!item.name) {
        warnings.push({
          code: "missing_item_name",
          severity: "high",
          message: "One or more imported items are missing a name. Review before publishing.",
        });
      }

      if (item.pricingType === "variant" && item.variants.length === 0) {
        warnings.push({
          code: "missing_variant_rows",
          severity: "high",
          message: `${item.name || "An item"} is marked as variant-priced but has no valid variants.`,
        });
      }

      if (item.platformCategory !== "soup" && item.pricingType !== "variant" && (item.price ?? 0) <= 0) {
        warnings.push({
          code: "missing_price",
          severity: "high",
          message: `${item.name || "An item"} is missing a valid price.`,
        });
      }

      if (item.lowConfidence) {
        warnings.push({
          code: "low_confidence_item",
          severity: "medium",
          message: `${item.name || "An item"} was extracted with low confidence and should be reviewed carefully.`,
        });
      }
    }
  }

  return warnings;
}

export function normalizeMenuDraft(draft: MenuImportDraft): MenuImportDraft {
  const grouped = new Map<string, MenuImportCategoryDraft>();

  for (const category of draft.categories ?? []) {
    for (const sourceItem of category.items ?? []) {
      const item = normalizeItem(sourceItem);
      const key = slugify(item.categoryName) || item.platformCategory;
      const existing = grouped.get(key) ?? {
        id: category.id,
        name: item.categoryName,
        inferred: category.inferred || !item.categoryName,
        items: [],
      };
      existing.name = item.categoryName;
      existing.items.push(item);
      grouped.set(key, existing);
    }
  }

  const categories = Array.from(grouped.values())
    .filter((category) => category.items.length > 0)
    .sort((a, b) => {
      const aKey = slugify(a.name);
      const bKey = slugify(b.name);
      const aIndex = CATEGORY_REVIEW_ORDER.indexOf(aKey);
      const bIndex = CATEGORY_REVIEW_ORDER.indexOf(bKey);
      if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  const warnings = [...(draft.warnings ?? []), ...getDraftQualityWarnings(categories)];
  const dedupedWarnings = new Map<string, MenuImportDraft["warnings"][number]>();

  for (const warning of [...warnings, ...detectDuplicateWarnings({ ...draft, categories, warnings: [] })]) {
    dedupedWarnings.set(`${warning.code}:${warning.message}`, warning);
  }

  return {
    ...draft,
    categories,
    warnings: Array.from(dedupedWarnings.values()),
  };
}

export function validateMenuDraftForPublish(draft: MenuImportDraft) {
  const normalized = normalizeMenuDraft(draft);
  const itemCount = normalized.categories.reduce((count, category) => count + category.items.length, 0);
  if (itemCount === 0) throw new Error("No menu items were found in the review draft.");

  const blockingWarnings = normalized.warnings.filter((warning) => warning.severity === "high");
  if (blockingWarnings.length > 0) {
    throw new Error(blockingWarnings[0]?.message || "Resolve high-severity menu import issues before publishing.");
  }

  return normalized;
}
