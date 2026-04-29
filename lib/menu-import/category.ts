import { CATEGORY_HINTS, PLATFORM_CATEGORY_LABELS, type PlatformFoodCategory } from "./constants";
import { cleanText } from "./utils";

const CUSTOM_CATEGORY_LABELS: Array<{ match: string[]; label: string; platformCategory: PlatformFoodCategory }> = [
  { match: ["jollof", "fried rice", "white rice", "native rice", "rice"], label: "Rice Dishes", platformCategory: "main" },
  { match: ["beans"], label: "Rice Dishes", platformCategory: "main" },
  { match: ["burger", "burgers"], label: "Burger", platformCategory: "main" },
  { match: ["spaghetti", "pasta", "noodles"], label: "Pasta", platformCategory: "main" },
  { match: ["amala", "semo", "eba", "fufu", "pounded yam", "tuwo"], label: "Swallow", platformCategory: "swallow" },
  { match: ["egusi", "ewedu", "ogbono", "okra", "afang", "nsala", "stew", "soup", "eforiro", "efo riro", "gbegiri", "pepper soup"], label: "Soups", platformCategory: "soup" },
  { match: ["chicken", "turkey", "beef", "fish", "goat", "ponmo", "snail", "gizzard", "titus", "assorted", "egg"], label: "Protein", platformCategory: "protein" },
  { match: ["zobo", "malt", "fanta", "coke", "juice", "water", "drink"], label: "Drinks", platformCategory: "drink" },
  { match: ["plantain", "salad", "fries", "chips", "moi moi", "moimoi"], label: "Sides", platformCategory: "side" },
  { match: ["sauce", "addon", "add on", "extra"], label: "Extras", platformCategory: "extra" },
];

function isPepperSoupLike(value: string) {
  const lower = cleanText(value).toLowerCase();
  if (!lower) return false;
  if (/\bpeppered\b/.test(lower)) return false;
  return /\bpepper soup\b/.test(lower) || lower === "pepper" || /\bpepper\b/.test(lower);
}

function findMatchedCategory(value: string): { label: string; platformCategory: PlatformFoodCategory } | null {
  const haystack = cleanText(value).toLowerCase();
  if (isPepperSoupLike(haystack)) {
    return { label: "Soups", platformCategory: "soup" };
  }
  return CUSTOM_CATEGORY_LABELS.find((entry) => entry.match.some((term) => haystack.includes(term))) ?? null;
}

function canonicalizeRawCategory(rawCategory: string) {
  const normalized = cleanText(rawCategory).toLowerCase();
  if (normalized === "chicken") {
    return {
      categoryName: "Chicken",
      platformCategory: "protein" as const,
    };
  }
  const matched = findMatchedCategory(rawCategory);
  if (!matched) return null;
  return {
    categoryName: matched.label,
    platformCategory: matched.platformCategory,
  };
}

export function inferPlatformCategory(name: string, rawCategory: string): PlatformFoodCategory {
  const haystack = `${cleanText(name)} ${cleanText(rawCategory)}`.toLowerCase();
  const explicitNameMatch = findMatchedCategory(name);
  if (explicitNameMatch) return explicitNameMatch.platformCategory;
  for (const entry of CATEGORY_HINTS) {
    if (entry.terms.some((term) => haystack.includes(term))) return entry.category;
  }
  return "main" satisfies PlatformFoodCategory;
}

export function inferDisplayCategory(platformCategory: PlatformFoodCategory) {
  return PLATFORM_CATEGORY_LABELS[platformCategory];
}

export function inferBestCategory(name: string, rawCategory: string) {
  const normalizedCategory = cleanText(rawCategory);
  if (normalizedCategory) {
    const canonicalCategory = canonicalizeRawCategory(normalizedCategory);
    return {
      categoryName: canonicalCategory?.categoryName ?? normalizedCategory,
      platformCategory: canonicalCategory?.platformCategory ?? inferPlatformCategory(name, normalizedCategory),
      inferred: Boolean(canonicalCategory && canonicalCategory.categoryName.toLowerCase() !== normalizedCategory.toLowerCase()),
    };
  }

  const nameMatch = findMatchedCategory(name);
  if (nameMatch) {
    return {
      categoryName: nameMatch.label,
      platformCategory: nameMatch.platformCategory,
      inferred: true,
    };
  }

  const platformCategory = inferPlatformCategory(name, rawCategory);
  return {
    categoryName: inferDisplayCategory(platformCategory),
    platformCategory,
    inferred: true,
  };
}
