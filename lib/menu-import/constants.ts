export const MENU_IMPORT_MAX_FILE_SIZE = 20 * 1024 * 1024;
export const MENU_IMPORT_MAX_PAGES = 12;
export const MENU_IMPORT_IMAGE_CONCURRENCY = 3;
export const MENU_IMPORT_SUPPORTED_MIME_TYPES = new Map<string, "image" | "pdf" | "docx">([
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
]);

export const PLATFORM_CATEGORY_LABELS = {
  main: "Main",
  side: "Sides",
  protein: "Proteins",
  swallow: "Swallow",
  soup: "Soups",
  drink: "Drinks",
  extra: "Extras",
} as const;

export type PlatformFoodCategory = keyof typeof PLATFORM_CATEGORY_LABELS;

export const CATEGORY_HINTS: Array<{ category: PlatformFoodCategory; terms: string[] }> = [
  { category: "main", terms: ["jollof", "fried rice", "white rice", "native rice", "rice", "beans"] },
  { category: "swallow", terms: ["amala", "semo", "eba", "pounded yam", "fufu", "tuwo"] },
  { category: "soup", terms: ["egusi", "ewedu", "ogbono", "okra", "soup", "stew", "afang", "nsala", "eforiro", "efo riro", "gbegiri"] },
  { category: "protein", terms: ["chicken", "turkey", "beef", "fish", "goat", "ponmo", "snail", "gizzard", "titus", "assorted", "egg"] },
  { category: "drink", terms: ["water", "juice", "fanta", "coke", "malt", "smoothie", "zobo", "drink"] },
  { category: "side", terms: ["moi moi", "moimoi", "salad", "plantain", "coleslaw", "egg", "fries", "chips", "pepper soup"] },
  { category: "extra", terms: ["addon", "add on", "extra", "sauce", "pepper", "dip"] },
];

export const SIZE_KEYWORDS = ["small", "medium", "large", "big", "jumbo", "family", "mini", "regular"] as const;

export const DEFAULT_MENU_IMPORT_MODEL = process.env.OPENAI_MENU_IMPORT_MODEL || "gpt-5.5";
export const DEFAULT_MENU_IMAGE_MODEL = process.env.OPENAI_MENU_IMAGE_MODEL || "gpt-image-2";
