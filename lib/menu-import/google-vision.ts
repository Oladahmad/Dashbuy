import type { IngestedMenuUpload } from "./types";
import { cleanText } from "./utils";

type VisionResponse = {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    error?: { message?: string };
  }>;
};

export async function extractMenuTextWithGoogleVision(upload: IngestedMenuUpload) {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY || "";
  if (!apiKey || upload.pageImages.length === 0) return "";

  const body = {
    requests: upload.pageImages.map((image) => ({
      image: { content: image.buffer.toString("base64") },
      features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
    })),
  };

  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => null)) as VisionResponse | null;
  if (!response.ok) {
    throw new Error(json?.responses?.[0]?.error?.message || "Google Vision OCR request failed.");
  }

  const successfulText = (json?.responses ?? [])
    .map((entry) => entry.fullTextAnnotation?.text ?? "")
    .filter(Boolean)
    .join("\n");

  if (successfulText) return cleanText(successfulText);

  const firstError = (json?.responses ?? []).find((entry) => entry.error?.message)?.error?.message;
  if (firstError) throw new Error(firstError);
  return "";
}
