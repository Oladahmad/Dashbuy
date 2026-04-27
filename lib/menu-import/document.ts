import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { fromPath } from "pdf2pic";
import sharp from "sharp";
import { MENU_IMPORT_MAX_FILE_SIZE, MENU_IMPORT_MAX_PAGES, MENU_IMPORT_SUPPORTED_MIME_TYPES } from "./constants";
import type { IngestedMenuUpload, SourcePageImage, UploadKind } from "./types";

async function preprocessImageBuffer(buffer: Buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .grayscale()
    .normalise()
    .sharpen({ sigma: 1.1 })
    .median(1)
    .png({ compressionLevel: 8 })
    .toBuffer();
}

function getMimeTypeFromFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

function resolveUploadKind(mimeType: string, filename: string): UploadKind {
  const kind = MENU_IMPORT_SUPPORTED_MIME_TYPES.get(mimeType) ?? MENU_IMPORT_SUPPORTED_MIME_TYPES.get(getMimeTypeFromFilename(filename));
  if (!kind) throw new Error("Unsupported file format. Upload JPG, PNG, WEBP, PDF or DOCX.");
  return kind;
}

export async function ingestMenuUpload(file: File): Promise<IngestedMenuUpload> {
  if (file.size <= 0) throw new Error("Upload is empty.");
  if (file.size > MENU_IMPORT_MAX_FILE_SIZE) throw new Error("Upload exceeds the 20MB size limit.");

  const mimeType = file.type || getMimeTypeFromFilename(file.name);
  const kind = resolveUploadKind(mimeType, file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (kind === "image") {
    const processed = await preprocessImageBuffer(buffer);
    return {
      kind,
      originalFilename: file.name,
      mimeType,
      size: file.size,
      extractedText: "",
      pageImages: [
        {
          filename: file.name,
          mimeType: "image/png",
          buffer: processed,
        },
      ],
      processingNotes: ["Image auto-oriented, denoised, normalized, and sharpened for OCR."],
    };
  }

  if (kind === "docx") {
    const extracted = await mammoth.extractRawText({ buffer });
    return {
      kind,
      originalFilename: file.name,
      mimeType,
      size: file.size,
      extractedText: extracted.value.trim(),
      pageImages: [],
      processingNotes: ["DOCX text extracted with Mammoth."],
    };
  }

  const parsed = await pdfParse(buffer);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "dashbuy-menu-import-"));
  const pdfPath = path.join(tempDir, "menu.pdf");

  try {
    await writeFile(pdfPath, buffer);
    const convert = fromPath(pdfPath, {
      density: 180,
      format: "png",
      width: 1600,
      height: 2200,
      savePath: tempDir,
      saveFilename: "menu-page",
    });

    const pageImages: SourcePageImage[] = [];
    const pageCount = Math.min(parsed.numpages || 1, MENU_IMPORT_MAX_PAGES);

    for (let page = 1; page <= pageCount; page += 1) {
      const result = (await convert(page, { responseType: "image" })) as { path?: string } | undefined;
      if (!result?.path) continue;
      const converted = await readFile(result.path);
      const processed = await preprocessImageBuffer(converted);
      pageImages.push({
        filename: `menu-page-${page}.png`,
        mimeType: "image/png",
        buffer: processed,
      });
    }

    return {
      kind,
      originalFilename: file.name,
      mimeType,
      size: file.size,
      extractedText: parsed.text?.trim() ?? "",
      pageImages,
      processingNotes: [
        `PDF text extracted from ${parsed.numpages || pageImages.length || 1} page(s).`,
        (parsed.numpages || 0) > MENU_IMPORT_MAX_PAGES ? `Only the first ${MENU_IMPORT_MAX_PAGES} page(s) were processed for OCR.` : "",
        pageImages.length > 0 ? "PDF pages converted to images for multimodal OCR." : "PDF page conversion returned no images.",
      ].filter(Boolean),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
