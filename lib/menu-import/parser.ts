import { inferBestCategory, inferDisplayCategory, inferPlatformCategory } from "./category";
import { PLATFORM_CATEGORY_LABELS } from "./constants";
import { extractMenuTextWithAwsTextract } from "./aws-textract";
import { extractMenuTextWithGroqVision } from "./groq-vision";
import { normalizeMenuDraft } from "./review";
import type { IngestedMenuUpload, MenuImportItemDraft, ParsedMenuItem, ParsedMenuResult } from "./types";
import { buildDescription, cleanText, groupDraftIntoCategories, parsePrice } from "./utils";

const CATEGORY_LINE_MATCHERS = ["rice", "swallow", "soup", "protein", "drinks", "extras", "combo", "sides", "beans", "pasta"];
const CATEGORY_ALIASES: Array<{ match: RegExp; category: string }> = [
  { match: /^rice\b/i, category: "rice" },
  { match: /^swallow\b/i, category: "swallow" },
  { match: /^soups?\b/i, category: "soup" },
  { match: /^proteins?\b/i, category: "protein" },
  { match: /^drinks?\b/i, category: "drinks" },
  { match: /^extras?\b/i, category: "extras" },
  { match: /^sides?\b/i, category: "sides" },
  { match: /^beans?\b/i, category: "beans" },
  { match: /^pasta(?:\s*&\s*noodles?)?\b/i, category: "pasta" },
];
const SIZE_PATTERN = /\b(Small|Medium|Large|Big|Jumbo|Family|Mini|Regular)\b/i;
const PRICE_TOKEN_PATTERN = /#?\d[\d,]*/g;
const SOUP_NAMES = ["egusi soup", "ogbono soup", "ewedu", "gbegiri", "eforiro", "efo riro"];
const SWALLOW_NAMES = ["amala", "semo", "eba", "fufu", "pounded yam", "tuwo"];
const UNIT_PATTERNS = [
  { match: /\bper scoop\b/i, pricingType: "per_scoop" as const, unitLabel: "Scoop" },
  { match: /\bper piece\b|\bper unit\b/i, pricingType: "per_unit" as const, unitLabel: "Piece" },
];

function sanitizeItemName(value: string) {
  return cleanText(
    value
      .replace(/\b(trippleb|hilton'?s|eat\s*&\s*chill|rippleb)\b/gi, "")
      .replace(/\bprice list\b/gi, "")
      .replace(/^#+/, "")
  );
}

function titleCase(value: string) {
  return cleanText(value).replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeSoupName(value: string) {
  const lower = cleanText(value).toLowerCase();
  if (!lower) return "";
  if (lower === "pepper" || lower === "pepper soup") return "Pepper Soup";
  if (lower === "efo riro" || lower === "eforiro") return "Eforiro Soup";
  if (lower === "ewedu") return "Ewedu Soup";
  if (lower === "gbegiri") return "Gbegiri Soup";
  if (lower.endsWith("soup")) return titleCase(lower);
  return `${titleCase(lower)} Soup`;
}

function normalizeRiceName(value: string) {
  const lower = cleanText(value).toLowerCase();
  if (!lower) return "";
  if (lower === "fried") return "Fried Rice";
  if (lower === "jollof") return "Jollof Rice";
  if (lower === "white") return "White Rice";
  if (lower === "native") return "Native Rice";
  if (lower === "rice") return "";
  if (lower.includes("rice")) return titleCase(lower);
  if (["fried", "jollof", "white", "native"].some((term) => lower.includes(term))) return `${titleCase(lower)} Rice`;
  return titleCase(lower);
}

function normalizeMainLikeName(value: string, categoryName: string, platformCategory: string) {
  const cleaned = sanitizeItemName(value);
  if (!cleaned) return "";
  const lowerCategory = cleanText(categoryName).toLowerCase();
  const lowerName = cleanText(cleaned).toLowerCase();
  if (/\bpepper\b/.test(lowerName) && !/\bpeppered\b/.test(lowerName)) return "Pepper Soup";
  if (platformCategory === "soup" || lowerCategory.includes("soup")) return normalizeSoupName(lowerName);
  if (platformCategory === "main" || lowerCategory.includes("rice")) return normalizeRiceName(lowerName);
  if (lowerCategory.includes("pasta") && /^spagetti$/i.test(cleaned)) return "Spaghetti";
  if (lowerCategory.includes("pasta") && /^pasta$/i.test(cleaned)) return "Pasta";
  return titleCase(cleaned);
}

function getPriceTokens(text: string) {
  return Array.from(text.matchAll(PRICE_TOKEN_PATTERN))
    .map((match) => parsePrice(match[0]))
    .filter((value): value is number => typeof value === "number" && value >= 100 && value <= 100000);
}

function isNoiseLine(line: string) {
  const text = cleanText(line);
  if (!text) return true;
  if (/^\d{1,2}:\d{2}(?:\s+\d{1,3})?$/.test(text)) return true;
  if (/\b(order|reservation|call|contact)\b/i.test(text) && /\d{7,}/.test(text)) return true;
  if (/buy from .* today/i.test(text)) return true;
  if (/price list/i.test(text)) return true;
  return false;
}

function isNumericOnlyName(value: string) {
  return /^[#\d,\s]+$/.test(cleanText(value));
}

function isLikelyStandaloneItemLabel(line: string) {
  const text = cleanText(line);
  if (!text || isNoiseLine(text)) return false;
  if (isLikelyCategoryLine(text)) return false;
  if (getPriceTokens(text).length > 0) return false;
  return /^[A-Za-z&'()/\s-]+$/.test(text);
}

function isLikelyCategoryLine(line: string) {
  const text = cleanText(line);
  if (!text) return false;
  if (/^[A-Z\s/&-]{4,}$/.test(line)) return true;
  return CATEGORY_LINE_MATCHERS.some((matcher) => text.toLowerCase().includes(matcher)) && !/\d/.test(text);
}

function extractLeadingCategory(line: string) {
  const text = cleanText(line);
  for (const entry of CATEGORY_ALIASES) {
    if (!entry.match.test(text)) continue;
    const remainder = cleanText(text.replace(entry.match, ""));
    return {
      category: entry.category,
      remainder,
    };
  }
  return null;
}

function splitEmbeddedCategories(line: string) {
  return line
    .replace(/\b(PROTEINS?|RICE|SWALLOW|SOUPS?|SIDES|PASTA(?:\s*&\s*NOODLES)?)\b/gi, "\n$1")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);
}

function extractInlinePrice(text: string) {
  const match = text.match(/^(.*?)(?:\s+|[-:]\s*)(#?\d[\d,]*)(?:\s+(.*))?$/i);
  if (!match) return null;

  const namePart = cleanText(match[1]);
  const price = parsePrice(match[2]);
  const trailingNotes = cleanText(match[3]);

  if (!namePart || !price) return null;
  return { namePart, price, trailingNotes };
}

function extractPriceEntries(text: string) {
  return Array.from(text.matchAll(/#?\d[\d,]*/g))
    .map((match) => ({
      raw: match[0],
      index: match.index ?? -1,
      price: parsePrice(match[0]),
    }))
    .filter((entry): entry is { raw: string; index: number; price: number } => entry.index >= 0 && typeof entry.price === "number");
}

function buildGenericVariants(prices: number[]) {
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const labelsByCount: Record<number, string[]> = {
    2: ["Small", "Big"],
    3: ["Small", "Medium", "Large"],
    4: ["Small", "Medium", "Large", "Jumbo"],
  };
  const labels = labelsByCount[sortedPrices.length] ?? sortedPrices.map((_, index) => `Option ${index + 1}`);
  return sortedPrices.map((price, index) => ({
    name: labels[index] ?? `Option ${index + 1}`,
    size: null,
    price,
    notes: null,
  }));
}

function extractBracketComment(text: string) {
  const match = text.match(/\(([^)]+)\)/);
  return cleanText(match?.[1] || "");
}

function extractSoupItems(text: string) {
  const lower = cleanText(text).toLowerCase();
  const found: string[] = [];
  for (const soup of SOUP_NAMES) {
    if (lower.includes(soup) && !found.includes(soup)) found.push(soup);
  }
  return found.map((soup) => ({
    name: normalizeSoupName(soup),
    description: "",
    notes: "",
    categoryName: "Soups",
    platformCategory: "soup" as const,
    foodType: "single" as const,
    pricingType: "fixed" as const,
    price: 0,
    unitLabel: null,
    variants: [],
    comboParts: [],
    addOns: [],
    sourceConfidence: 0.66,
  }));
}

function parseSoupSwallowComboLine(text: string) {
  const lower = cleanText(text).toLowerCase();
  const soup = SOUP_NAMES.find((entry) => lower.includes(entry));
  const swallow = SWALLOW_NAMES.find((entry) => lower.includes(entry));
  const prices = extractPriceEntries(text);
  if (!soup || !swallow || prices.length === 0) return null;

  return [
    {
      name: normalizeSoupName(soup),
      description: "",
      notes: "",
      categoryName: "Soups",
      platformCategory: "soup" as const,
      foodType: "single" as const,
      pricingType: "fixed" as const,
      price: 0,
      unitLabel: null,
      variants: [],
      comboParts: [],
      addOns: [],
      sourceConfidence: 0.62,
    },
    {
      name: titleCase(swallow),
      description: "",
      notes: "",
      categoryName: "Swallow",
      platformCategory: "swallow" as const,
      foodType: "single" as const,
      pricingType: "fixed" as const,
      price: prices[0].price,
      unitLabel: null,
      variants: [],
      comboParts: [],
      addOns: [],
      sourceConfidence: 0.58,
    },
  ];
}

function normalizeNameAndPricing(namePart: string, trailingNotes: string) {
  const combined = cleanText(`${namePart} ${trailingNotes}`);
  const matchedUnit = UNIT_PATTERNS.find((entry) => entry.match.test(combined));
  return {
    normalizedName: cleanText(namePart.replace(/\bper scoop\b|\bper piece\b|\bper unit\b/gi, "")),
    pricingType: (matchedUnit?.pricingType ?? "fixed") as MenuImportItemDraft["pricingType"],
    unitLabel: matchedUnit?.unitLabel ?? null,
    notes: cleanText(trailingNotes),
  };
}

function parseLineAsItem(line: string, activeCategory: string): ParsedMenuItem | null {
  const categoryPrefix = extractLeadingCategory(line);
  const derivedCategory = categoryPrefix?.category || activeCategory;
  const text = cleanText(categoryPrefix?.remainder || line);
  if (!text) return null;

  const priceEntries = extractPriceEntries(text);
  const firstPriceIndex = priceEntries[0]?.index ?? -1;
  const textBeforePrices = firstPriceIndex >= 0 ? cleanText(text.slice(0, firstPriceIndex)) : text;
  const textAfterPrices = firstPriceIndex >= 0 ? cleanText(text.slice(firstPriceIndex)) : "";

  const parts = text.split(/\s+-\s+|[\u2013\u2014-]\s*/).map(cleanText).filter(Boolean);
  const splitPrice = parts.length > 1 ? parsePrice(parts.slice(1).join(" ")) : null;
  const inlinePrice = extractInlinePrice(text);
  const namePart = sanitizeItemName(textBeforePrices || parts[0] || inlinePrice?.namePart || text);
  const price = splitPrice ?? inlinePrice?.price ?? priceEntries[0]?.price ?? null;
  const bracketComment = extractBracketComment(text);
  const trailingNotes = cleanText(
    parts.length > 1 ? parts.slice(1).join(" ") : inlinePrice?.trailingNotes || textAfterPrices.replace(/^#?\d[\d,]*/, "")
  );

  if (!namePart || isNumericOnlyName(namePart)) return null;
  if (!price && !/\+/.test(namePart) && !SIZE_PATTERN.test(namePart)) return null;

  const bestCategory = inferBestCategory(namePart, derivedCategory);
  const platformCategory = bestCategory.platformCategory ?? inferPlatformCategory(namePart, derivedCategory);
  const categoryName = bestCategory.categoryName || inferDisplayCategory(platformCategory);
  const normalizedName = normalizeMainLikeName(namePart, categoryName, platformCategory);
  const variantMatch = namePart.match(/^(.*?)(?:\(|\b)(Small|Medium|Large|Big|Jumbo|Family|Mini|Regular)(?:\)|\b)/i);
  const isCombo = /\+| combo\b| with /i.test(namePart);
  const normalizedPricing = normalizeNameAndPricing(normalizedName || namePart, trailingNotes);

  if (priceEntries.length > 1 && !SIZE_PATTERN.test(text)) {
    return {
      name: normalizedPricing.normalizedName || normalizedName || namePart,
      description: "",
      notes: cleanText([trailingNotes, bracketComment].filter(Boolean).join(". ")),
      categoryName,
      platformCategory,
      foodType: "single",
      pricingType: "variant",
      price: null,
      unitLabel: null,
      variants: buildGenericVariants(priceEntries.map((entry) => entry.price)),
      comboParts: [],
      addOns: [],
      sourceConfidence: 0.52,
    };
  }

  if (variantMatch && price) {
    return {
      name: cleanText(variantMatch[1]),
      description: "",
      notes: trailingNotes,
      categoryName,
      platformCategory,
      foodType: "single",
      pricingType: "variant",
      price: null,
      unitLabel: null,
      variants: [
        {
          name: cleanText(variantMatch[0].replace(variantMatch[1], "").replace(/[()]/g, "")),
          size: cleanText(variantMatch[2]),
          price,
          notes: trailingNotes || null,
        },
      ],
      comboParts: [],
      addOns: [],
      sourceConfidence: 0.74,
    };
  }

  return {
    name: normalizedPricing.normalizedName || normalizedName || namePart,
    description: "",
    notes: normalizedPricing.notes,
    categoryName,
    platformCategory,
    foodType: isCombo ? "combo" : "single",
    pricingType: normalizedPricing.pricingType,
    price: price ?? 0,
    unitLabel: normalizedPricing.unitLabel,
    variants: [],
    comboParts: isCombo ? (normalizedPricing.normalizedName || namePart).split(/\+| with /i).map(cleanText).filter(Boolean) : [],
    addOns: [],
    sourceConfidence: price ? 0.68 : 0.45,
  };
}

function parseContinuationLine(line: string, pendingName: string, activeCategory: string): ParsedMenuItem | null {
  const priceEntries = extractPriceEntries(line);
  if (priceEntries.length === 0) return null;

  const bestCategory = inferBestCategory(pendingName, activeCategory);
  const trailingNotes = cleanText(extractBracketComment(line));
  const normalizedName = normalizeMainLikeName(pendingName, bestCategory.categoryName, bestCategory.platformCategory);

  return {
    name: normalizedName || pendingName,
    description: "",
    notes: trailingNotes,
    categoryName: bestCategory.categoryName || inferDisplayCategory(bestCategory.platformCategory),
    platformCategory: bestCategory.platformCategory,
    foodType: "single",
    pricingType: priceEntries.length > 1 ? "variant" : "fixed",
    price: priceEntries.length > 1 ? null : priceEntries[0]?.price ?? null,
    unitLabel: null,
    variants: priceEntries.length > 1 ? buildGenericVariants(priceEntries.map((entry) => entry.price)) : [],
    comboParts: [],
    addOns: [],
    sourceConfidence: priceEntries.length > 1 ? 0.58 : 0.62,
  };
}

function mergeVariantDuplicates(items: ParsedMenuItem[]) {
  const merged = new Map<string, ParsedMenuItem>();
  for (const item of items) {
    const key = `${item.categoryName.toLowerCase()}::${item.name.toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...item,
        description: cleanText(item.description) || buildDescription(item.notes, item.addOns),
      });
      continue;
    }

    if (item.variants.length > 0) {
      existing.variants.push(...item.variants);
      existing.pricingType = "variant";
      existing.price = null;
      existing.sourceConfidence = Math.max(existing.sourceConfidence, item.sourceConfidence);
      continue;
    }

    if (!existing.price && item.price) existing.price = item.price;
  }
  return Array.from(merged.values());
}

function splitCompoundLine(line: string) {
  const compact = cleanText(line.replace(/\s+/g, " "));
  if (!compact) return [];

  const segments = compact.split(/(?<=[#\d)])\s+(?=[A-Za-z])/g).map(cleanText).filter(Boolean);
  return segments.length > 1 ? segments : [compact];
}

function buildCandidateLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean)
    .flatMap(splitEmbeddedCategories)
    .flatMap((line) => line.split(/(?=\b(?:Egusi soup|Ogbono soup|Ewedu|Gbegiri|Eforiro|Efo riro)\b)/i).map(cleanText).filter(Boolean))
    .flatMap(splitCompoundLine);
}

function parseMenuHeuristically(text: string): ParsedMenuResult {
  const warnings: ParsedMenuResult["warnings"] = [];
  const rawLines = buildCandidateLines(text);
  let activeCategory = "";
  let pendingItemLabel = "";
  const items: ParsedMenuItem[] = [];

  for (const line of rawLines) {
    if (isNoiseLine(line)) continue;

    const lowerLine = cleanText(line).toLowerCase();
    if (lowerLine === "pasta" || lowerLine === "spagetti" || lowerLine === "spaghetti") {
      pendingItemLabel = titleCase(lowerLine === "spagetti" ? "Spaghetti" : lowerLine);
      activeCategory = "pasta";
      continue;
    }

    const soupSwallowItems = parseSoupSwallowComboLine(line);
    if (soupSwallowItems) {
      items.push(...soupSwallowItems);
      continue;
    }

    const soupItems = extractSoupItems(line);
    if (soupItems.length >= 1 && getPriceTokens(line).length === 0) {
      items.push(...soupItems);
      continue;
    }

    if (pendingItemLabel) {
      const continuedItem = parseContinuationLine(line, pendingItemLabel, activeCategory);
      if (continuedItem) {
        items.push(continuedItem);
        pendingItemLabel = "";
        continue;
      }
      pendingItemLabel = "";
    }

    const leadingCategory = extractLeadingCategory(line);
    if (leadingCategory && !leadingCategory.remainder) {
      activeCategory = leadingCategory.category;
      continue;
    }

    if (isLikelyCategoryLine(line)) {
      activeCategory = line;
      continue;
    }

    if (isLikelyStandaloneItemLabel(line)) {
      pendingItemLabel = sanitizeItemName(line);
      continue;
    }

    const item = parseLineAsItem(line, activeCategory);
    if (item) items.push(item);
  }

  if (items.length === 0) {
    warnings.push({
      code: "unreadable_upload",
      severity: "high",
      message: "The upload could not be parsed confidently. Try a clearer photo or review the OCR result manually.",
    });
  }

  return {
    sourceSummary: "Parsed from OCR and extracted document text.",
    items: mergeVariantDuplicates(items),
    warnings,
  };
}

export async function buildMenuDraft(upload: IngestedMenuUpload) {
  const warnings: ParsedMenuResult["warnings"] = [];
  const documentText = cleanText(upload.extractedText);
  let groqText = "";
  try {
    groqText = await extractMenuTextWithGroqVision(upload);
  } catch (error) {
    warnings.push({
      code: "groq_vision_ocr_failed",
      severity: "medium",
      message: error instanceof Error ? `Groq vision OCR failed: ${error.message}` : "Groq vision OCR failed.",
    });
  }

  let textractText = "";
  if (!groqText) {
    textractText = await extractMenuTextWithAwsTextract(upload).catch((error: unknown) => {
      warnings.push({
        code: "aws_textract_ocr_failed",
        severity: "medium",
        message: error instanceof Error ? `AWS Textract OCR failed: ${error.message}` : "AWS Textract OCR failed.",
      });
      return "";
    });
  }

  const ocrText = [documentText, groqText, textractText]
    .filter(Boolean)
    .filter((value, index, list) => list.findIndex((entry) => entry === value) === index)
    .join("\n");

  if (!ocrText) {
    warnings.push({
      code: "ocr_text_unavailable",
      severity: "high",
      message: upload.pageImages.length > 0
        ? "No OCR text could be extracted. Add a GROQ_API_KEY for vision OCR, keep AWS Textract as fallback, or upload a clearer file."
        : "No readable text could be extracted from this file.",
    });
  }

  const parsed = parseMenuHeuristically(ocrText);
  return normalizeMenuDraft(groupDraftIntoCategories(parsed.items, parsed.sourceSummary, [...warnings, ...parsed.warnings]));
}

export { PLATFORM_CATEGORY_LABELS };
