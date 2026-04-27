import { inferDisplayCategory, inferPlatformCategory } from "./category";
import { PLATFORM_CATEGORY_LABELS } from "./constants";
import { extractMenuTextWithGoogleVision } from "./google-vision";
import { extractMenuWithOpenAI } from "./openai";
import { normalizeMenuDraft } from "./review";
import type { IngestedMenuUpload, ParsedMenuItem, ParsedMenuResult } from "./types";
import { buildDescription, cleanText, groupDraftIntoCategories, parsePrice } from "./utils";

const CATEGORY_LINE_MATCHERS = ["rice", "swallow", "soup", "protein", "drinks", "extras", "combo", "sides"];

function isLikelyCategoryLine(line: string) {
  const text = cleanText(line);
  if (!text) return false;
  if (/^[A-Z\s/&-]{4,}$/.test(line)) return true;
  return CATEGORY_LINE_MATCHERS.some((matcher) => text.toLowerCase().includes(matcher)) && !/\d/.test(text);
}

function parseLineAsItem(line: string, activeCategory: string): ParsedMenuItem | null {
  const text = cleanText(line);
  if (!text) return null;
  const parts = text.split(/\s+-\s+|[\u2013\u2014-]\s*/).map(cleanText).filter(Boolean);
  const namePart = parts[0] || text;
  const pricePart = parts.slice(1).join(" ");
  const price = parsePrice(pricePart);

  if (!price && !/\+/.test(namePart) && !/\bsmall\b|\bmedium\b|\blarge\b|\bbig\b/i.test(namePart)) {
    return null;
  }

  const platformCategory = inferPlatformCategory(namePart, activeCategory);
  const categoryName = activeCategory || inferDisplayCategory(platformCategory);
  const variantMatch = namePart.match(/^(.*?)(?:\(|\b)(Small|Medium|Large|Big|Jumbo|Family|Mini|Regular)(?:\)|\b)/i);
  const isCombo = /\+| combo\b| with /i.test(namePart);

  if (variantMatch && price) {
    return {
      name: cleanText(variantMatch[1]),
      description: "",
      notes: pricePart,
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
          notes: pricePart || null,
        },
      ],
      comboParts: [],
      addOns: [],
      sourceConfidence: 0.66,
    };
  }

  return {
    name: namePart,
    description: "",
    notes: pricePart,
    categoryName,
    platformCategory,
    foodType: isCombo ? "combo" : "single",
    pricingType: /\bper scoop\b/i.test(pricePart) ? "per_scoop" : /\bper piece\b|\bper unit\b/i.test(pricePart) ? "per_unit" : "fixed",
    price: price ?? 0,
    unitLabel: /\bper scoop\b/i.test(pricePart) ? "Scoop" : /\bper piece\b|\bper unit\b/i.test(pricePart) ? "Piece" : null,
    variants: [],
    comboParts: isCombo ? namePart.split(/\+| with /i).map(cleanText).filter(Boolean) : [],
    addOns: [],
    sourceConfidence: price ? 0.62 : 0.45,
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

function parseMenuHeuristically(text: string): ParsedMenuResult {
  const warnings: ParsedMenuResult["warnings"] = [];
  const rawLines = text.split(/\r?\n/).map(cleanText).filter(Boolean);
  let activeCategory = "";
  const items: ParsedMenuItem[] = [];

  for (const line of rawLines) {
    if (/\d.*\d.*\d/.test(line) && !/\bsmall\b|\bmedium\b|\blarge\b|\bbig\b|\bjumbo\b|\bfamily\b/i.test(line)) {
      warnings.push({
        code: "ambiguous_pricing",
        severity: "medium",
        message: `A line may contain multiple prices that need review: ${line}`,
      });
    }
    if (isLikelyCategoryLine(line)) {
      activeCategory = line;
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
    sourceSummary: "Parsed with fallback OCR heuristics.",
    items: mergeVariantDuplicates(items),
    warnings,
  };
}

function normalizeOpenAIResult(result: ParsedMenuResult): ParsedMenuResult {
  return {
    sourceSummary: cleanText(result.sourceSummary) || "Menu extracted with AI.",
    items: (result.items ?? []).map((item) => ({
      ...item,
      name: cleanText(item.name),
      description: cleanText(item.description),
      notes: cleanText(item.notes),
      categoryName: cleanText(item.categoryName) || inferDisplayCategory(item.platformCategory ?? "main"),
      platformCategory: item.platformCategory ?? inferPlatformCategory(item.name, item.categoryName),
      unitLabel: cleanText(item.unitLabel) || null,
      addOns: (item.addOns ?? []).map(cleanText).filter(Boolean),
      comboParts: (item.comboParts ?? []).map(cleanText).filter(Boolean),
      variants: (item.variants ?? []).map((variant) => ({
        name: cleanText(variant.name),
        size: cleanText(variant.size) || null,
        price: parsePrice(variant.price) ?? 0,
        notes: cleanText(variant.notes) || null,
      })),
      price: parsePrice(item.price),
      sourceConfidence: Number.isFinite(item.sourceConfidence) ? item.sourceConfidence : 0.7,
    })),
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
  };
}

export async function buildMenuDraft(upload: IngestedMenuUpload) {
  try {
    const openaiResult = normalizeOpenAIResult(await extractMenuWithOpenAI(upload));
    return normalizeMenuDraft(groupDraftIntoCategories(openaiResult.items, openaiResult.sourceSummary, openaiResult.warnings));
  } catch (primaryError) {
    const fallbackText = cleanText(upload.extractedText) || (await extractMenuTextWithGoogleVision(upload));
    const fallback = parseMenuHeuristically(fallbackText);
    return normalizeMenuDraft(groupDraftIntoCategories(fallback.items, fallback.sourceSummary, [
      {
        code: "openai_fallback_triggered",
        severity: "medium",
        message: `Primary multimodal extraction failed. Fallback OCR was used instead. ${primaryError instanceof Error ? primaryError.message : ""}`.trim(),
      },
      ...fallback.warnings,
    ]));
  }
}

export { PLATFORM_CATEGORY_LABELS };
