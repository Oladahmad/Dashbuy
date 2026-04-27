import { MENU_IMPORT_IMAGE_CONCURRENCY } from "./constants";
import { generateFoodImage } from "./openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import sharp from "sharp";
import { uploadFoodImageFromBuffer } from "./storage";
import type { ImageCandidateResult, MenuImportDraft, MenuImportItemDraft } from "./types";
import { cleanText, flattenDraftItems, mapWithConcurrency, slugify, withRetry } from "./utils";

function buildSearchQuery(item: MenuImportItemDraft) {
  return `${item.name} Nigerian food high quality`;
}

function buildGenerationPrompt(item: MenuImportItemDraft) {
  return `Ultra-realistic Nigerian food photography of ${item.name}, plated naturally, commercial food photography, close-up plating, realistic lighting.`;
}

async function getCachedImage(queryKey: string) {
  const { data, error } = await supabaseAdmin
    .from("menu_image_cache")
    .select("image_url, source_provider")
    .eq("query_key", queryKey)
    .maybeSingle<{ image_url: string | null; source_provider: string | null }>();
  if (error) return null;
  if (!data?.image_url) return null;
  return {
    imageUrl: data.image_url,
    source: (data.source_provider === "generated" ? "generated" : "search") as ImageCandidateResult["source"],
  };
}

async function setCachedImage(queryKey: string, imageUrl: string, source: ImageCandidateResult["source"]) {
  await supabaseAdmin.from("menu_image_cache").upsert({
    query_key: queryKey,
    image_url: imageUrl,
    source_provider: source,
    updated_at: new Date().toISOString(),
  });
}

async function downloadImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Image download failed.");
  const mimeType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  const normalized = await sharp(buffer)
    .rotate()
    .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
  return { buffer: normalized, mimeType: "image/jpeg" };
}

async function searchGoogleCustomImage(item: MenuImportItemDraft, vendorId: string) {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || "";
  const searchEngineId = process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID || "";
  if (!apiKey || !searchEngineId) return null;

  const params = new URLSearchParams({
    key: apiKey,
    cx: searchEngineId,
    q: buildSearchQuery(item),
    searchType: "image",
    num: "5",
    imgType: "photo",
    imgSize: "large",
    safe: "active",
  });

  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
  const json = (await response.json().catch(() => null)) as
    | { items?: Array<{ link?: string; title?: string; mime?: string; image?: { width?: number; height?: number } }> }
    | null;

  if (!response.ok) return null;
  const itemName = item.name.toLowerCase();
  const candidate = [...(json?.items ?? [])]
    .map((entry) => {
      const title = cleanText(entry.title).toLowerCase();
      const link = cleanText(entry.link).toLowerCase();
      const text = `${title} ${link}`;
      let score = 0;
      if (text.includes(itemName)) score += 5;
      if (/nigerian|food|dish|meal|plate/.test(text)) score += 3;
      if (/logo|cartoon|watermark|vector|icon|stock/.test(text)) score -= 10;
      if ((entry.image?.width ?? 0) >= 1000) score += 2;
      if ((entry.image?.height ?? 0) >= 1000) score += 2;
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score)
    .find((entry) => entry.score > 0)?.entry;
  if (!candidate?.link) return null;

  const downloaded = await downloadImage(candidate.link);
  const publicUrl = await uploadFoodImageFromBuffer({
    vendorId,
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType,
    prefix: `search-${slugify(item.name) || "food"}`,
  });

  return {
    imageUrl: publicUrl,
    source: "search" as const,
  };
}

async function generateAndUploadImage(item: MenuImportItemDraft, vendorId: string) {
  const generated = await generateFoodImage(buildGenerationPrompt(item));
  const base64 = generated.imageUrl.replace(/^data:image\/png;base64,/, "");
  const publicUrl = await uploadFoodImageFromBuffer({
    vendorId,
    buffer: Buffer.from(base64, "base64"),
    mimeType: "image/png",
    prefix: `generated-${slugify(item.name) || "food"}`,
  });
  return {
    imageUrl: publicUrl,
    source: "generated" as const,
  };
}

async function resolveImageForItem(item: MenuImportItemDraft, vendorId: string) {
  const queryKey = slugify(`${item.name}-${item.platformCategory}`);
  const cached = await getCachedImage(queryKey);
  if (cached) return cached;

  const result =
    (await withRetry(() => searchGoogleCustomImage(item, vendorId), 1).catch(() => null)) ??
    (await withRetry(() => generateAndUploadImage(item, vendorId), 1));

  await setCachedImage(queryKey, result.imageUrl, result.source);
  return result;
}

export async function enrichDraftWithImages(draft: MenuImportDraft, vendorId: string) {
  const flat = flattenDraftItems(draft);
  const resolvedByKey = new Map<string, ImageCandidateResult | null>();

  await mapWithConcurrency(flat, MENU_IMPORT_IMAGE_CONCURRENCY, async ({ item }) => {
    if (item.imageUrl) return;
    const cacheKey = item.duplicateKey || slugify(item.name);

    if (cacheKey && resolvedByKey.has(cacheKey)) {
      const existing = resolvedByKey.get(cacheKey);
      if (existing) {
        item.imageUrl = existing.imageUrl;
        item.imageSource = existing.source;
      }
      return;
    }

    try {
      const resolved = await resolveImageForItem(item, vendorId);
      item.imageUrl = resolved.imageUrl;
      item.imageSource = resolved.source;
      if (cacheKey) resolvedByKey.set(cacheKey, resolved);
    } catch {
      if (cacheKey) resolvedByKey.set(cacheKey, null);
      draft.warnings.push({
        code: "image_lookup_failed",
        severity: "low",
        message: `Could not find an image automatically for ${item.name}. The vendor can replace it during review.`,
      });
    }
  });
  return draft;
}
