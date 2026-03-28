import { ProductCategory } from "@/lib/productCategories";

export type ProductFeatureOption = {
  name: string;
  valuePlaceholder: string;
};

const COMMON_FEATURES: ProductFeatureOption[] = [
  { name: "Brand", valuePlaceholder: "e.g Nike" },
  { name: "Model", valuePlaceholder: "e.g Air Max 270" },
  { name: "Color", valuePlaceholder: "e.g Black" },
  { name: "Size", valuePlaceholder: "e.g XL / 42" },
  { name: "Material", valuePlaceholder: "e.g Cotton" },
  { name: "Condition", valuePlaceholder: "e.g New" },
  { name: "Weight", valuePlaceholder: "e.g 1.2kg" },
  { name: "Dimensions", valuePlaceholder: "e.g 20 x 10 x 5 cm" },
  { name: "Warranty", valuePlaceholder: "e.g 12 months" },
  { name: "Expiry Date", valuePlaceholder: "e.g 2027-12-31" },
];

const CATEGORY_FEATURES: Record<ProductCategory, ProductFeatureOption[]> = {
  Clothing: [
    { name: "Fit", valuePlaceholder: "e.g Regular fit" },
    { name: "Gender", valuePlaceholder: "e.g Unisex" },
    { name: "Sleeve Type", valuePlaceholder: "e.g Short sleeve" },
  ],
  Shoes: [
    { name: "Shoe Size", valuePlaceholder: "e.g 43" },
    { name: "Sole Type", valuePlaceholder: "e.g Rubber" },
    { name: "Closure Type", valuePlaceholder: "e.g Lace-up" },
  ],
  "Perfumes & Fragrances": [
    { name: "Volume", valuePlaceholder: "e.g 100ml" },
    { name: "Fragrance Family", valuePlaceholder: "e.g Woody" },
    { name: "Gender", valuePlaceholder: "e.g Men" },
  ],
  "Beauty & Makeup": [
    { name: "Skin Type", valuePlaceholder: "e.g Oily skin" },
    { name: "Shade", valuePlaceholder: "e.g Warm beige" },
    { name: "Coverage", valuePlaceholder: "e.g Full coverage" },
  ],
  "Phones & Electronics": [
    { name: "Storage", valuePlaceholder: "e.g 128GB" },
    { name: "RAM", valuePlaceholder: "e.g 8GB" },
    { name: "Battery", valuePlaceholder: "e.g 5000mAh" },
    { name: "Connectivity", valuePlaceholder: "e.g 5G, Wi-Fi, Bluetooth" },
  ],
  Groceries: [
    { name: "Pack Size", valuePlaceholder: "e.g 1kg" },
    { name: "Flavour", valuePlaceholder: "e.g Vanilla" },
    { name: "Origin", valuePlaceholder: "e.g Nigeria" },
  ],
  "Baby Products": [
    { name: "Age Range", valuePlaceholder: "e.g 0-12 months" },
    { name: "Pack Count", valuePlaceholder: "e.g 72 pieces" },
    { name: "Hypoallergenic", valuePlaceholder: "e.g Yes" },
  ],
  Pharmacy: [
    { name: "Dosage", valuePlaceholder: "e.g 500mg" },
    { name: "Prescription Required", valuePlaceholder: "e.g No" },
    { name: "Active Ingredient", valuePlaceholder: "e.g Paracetamol" },
  ],
  "Supplements & Wellness": [
    { name: "Serving Size", valuePlaceholder: "e.g 2 capsules" },
    { name: "Servings", valuePlaceholder: "e.g 60 servings" },
    { name: "Goal", valuePlaceholder: "e.g Energy support" },
  ],
  Others: [{ name: "Specification", valuePlaceholder: "e.g 220V" }],
};

export function getProductFeatureOptions(category: ProductCategory | ""): ProductFeatureOption[] {
  const merged = [...COMMON_FEATURES, ...(category ? CATEGORY_FEATURES[category] : [])];
  const seen = new Set<string>();
  const uniq: ProductFeatureOption[] = [];
  for (const item of merged) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    uniq.push(item);
  }
  return uniq;
}

export function getProductFeaturePlaceholder(featureName: string) {
  const all = [...COMMON_FEATURES, ...Object.values(CATEGORY_FEATURES).flat()];
  const found = all.find((x) => x.name === featureName);
  return found?.valuePlaceholder ?? "Enter value";
}

