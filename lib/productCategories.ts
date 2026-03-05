export const PRODUCT_CATEGORIES = [
  "Clothing",
  "Shoes",
  "Perfumes & Fragrances",
  "Beauty & Makeup",
  "Phones & Electronics",
  "Groceries",
  "Baby Products",
  "Pharmacy",
  "Supplements & Wellness",
  "Others",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export function isProductCategory(value: unknown): value is ProductCategory {
  return typeof value === "string" && PRODUCT_CATEGORIES.includes(value as ProductCategory);
}

export function normalizeProductCategory(value: string | null | undefined): ProductCategory {
  if (isProductCategory(value)) return value;
  return "Others";
}
