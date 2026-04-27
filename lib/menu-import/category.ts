import { CATEGORY_HINTS, PLATFORM_CATEGORY_LABELS, type PlatformFoodCategory } from "./constants";
import { cleanText } from "./utils";

const CUSTOM_CATEGORY_LABELS: Array<{ match: string[]; label: string; platformCategory: PlatformFoodCategory }> = [
  { match: ["rice", "jollof", "fried rice"], label: "Rice Dishes", platformCategory: "main" },
  { match: ["beans"], label: "Beans Dishes", platformCategory: "main" },
  { match: ["spaghetti", "pasta", "noodles"], label: "Pasta", platformCategory: "main" },
  { match: ["amala", "semo", "eba", "fufu", "pounded yam", "tuwo"], label: "Swallow", platformCategory: "swallow" },
  { match: ["egusi", "ewedu", "ogbono", "okra", "afang", "nsala", "stew", "soup"], label: "Soups", platformCategory: "soup" },
  { match: ["chicken", "turkey", "beef", "fish", "goat", "ponmo", "snail", "gizzard"], label: "Proteins", platformCategory: "protein" },
  { match: ["zobo", "malt", "fanta", "coke", "juice", "water", "drink"], label: "Drinks", platformCategory: "drink" },
  { match: ["plantain", "salad", "egg", "fries", "chips", "moi moi"], label: "Sides", platformCategory: "side" },
  { match: ["pepper", "sauce", "addon", "add on", "extra"], label: "Extras", platformCategory: "extra" },
];

export function inferPlatformCategory(name: string, rawCategory: string) {
  const haystack = `${cleanText(name)} ${cleanText(rawCategory)}`.toLowerCase();
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
    return {
      categoryName: normalizedCategory,
      platformCategory: inferPlatformCategory(name, normalizedCategory),
      inferred: false,
    };
  }

  const haystack = cleanText(name).toLowerCase();
  const matched = CUSTOM_CATEGORY_LABELS.find((entry) => entry.match.some((term) => haystack.includes(term)));
  if (matched) {
    return {
      categoryName: matched.label,
      platformCategory: matched.platformCategory,
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
