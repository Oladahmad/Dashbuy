import OpenAI from "openai";
import { DEFAULT_MENU_IMAGE_MODEL, DEFAULT_MENU_IMPORT_MODEL } from "./constants";
import { MENU_IMPORT_RESPONSE_SCHEMA } from "./schema";
import type { ImageCandidateResult, IngestedMenuUpload, ParsedMenuResult } from "./types";
import { cleanText } from "./utils";

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY on server.");
  return new OpenAI({ apiKey });
}

function getImageClient() {
  const xaiApiKey = process.env.XAI_API_KEY || "";
  if (xaiApiKey) {
    return {
      client: new OpenAI({
        apiKey: xaiApiKey,
        baseURL: "https://api.x.ai/v1",
      }),
      model: process.env.XAI_IMAGE_MODEL || "grok-imagine-image",
    };
  }

  const openAiApiKey = process.env.OPENAI_API_KEY || "";
  if (!openAiApiKey) throw new Error("Missing OPENAI_API_KEY or XAI_API_KEY on server.");
  return {
    client: new OpenAI({ apiKey: openAiApiKey }),
    model: DEFAULT_MENU_IMAGE_MODEL,
  };
}

function buildExtractionPrompt(upload: IngestedMenuUpload) {
  return [
    "Extract a Nigerian restaurant menu into structured JSON.",
    "Understand category sections, grouped rows, combo meals, add-ons, and size-based variants.",
    "Treat '+', '&', 'with', or grouped meal names as possible combos.",
    "If an item has Small/Medium/Large or similar sizes, use variants and do not duplicate the base item.",
    "Infer a reasonable category when the source omits one. Prefer categories like Rice Dishes, Swallow, Soups, Proteins, Drinks, Sides, Extras, Beans Dishes, or Pasta when appropriate.",
    "Prices should be integers in naira.",
    "Use confidence below 0.6 for uncertain OCR or ambiguous price assignments.",
    "When the same food appears in multiple sizes, output one item with variants sorted from lowest to highest price.",
    "When a line looks like a combo meal, set foodType to combo and populate comboParts.",
    "",
    upload.processingNotes.length > 0 ? `Preprocessing notes:\n${upload.processingNotes.join("\n")}` : "Preprocessing notes: none",
    "",
    upload.extractedText ? `OCR/Text context:\n${upload.extractedText}` : "OCR/Text context: none",
    "",
    "Return only valid JSON matching the schema.",
  ].join("\n");
}

function parseStructuredOutput<T>(response: unknown) {
  const outputText = cleanText((response as { output_text?: string } | null)?.output_text);
  if (!outputText) throw new Error("OpenAI returned no structured output.");
  return JSON.parse(outputText) as T;
}

export async function extractMenuWithOpenAI(upload: IngestedMenuUpload): Promise<ParsedMenuResult> {
  const client = getClient();
  const input = [
    {
      role: "system" as const,
      content: [
        {
          type: "input_text" as const,
          text: "You are a restaurant menu extraction system for Dashbuy. Preserve hierarchy and choose the most likely semantic meaning of noisy OCR.",
        },
      ],
    },
    {
      role: "user" as const,
      content: [
        {
          type: "input_text" as const,
          text: buildExtractionPrompt(upload),
        },
        ...upload.pageImages.map((image) => ({
          type: "input_image" as const,
          image_url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}`,
          detail: "high" as const,
        })),
      ],
    },
  ];

  const response = await client.responses.create({
    model: DEFAULT_MENU_IMPORT_MODEL,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "dashbuy_menu_import",
        strict: true,
        schema: MENU_IMPORT_RESPONSE_SCHEMA,
      },
    },
  });

  return parseStructuredOutput<ParsedMenuResult>(response);
}

export async function generateFoodImage(prompt: string): Promise<ImageCandidateResult> {
  const { client, model } = getImageClient();
  const response = await client.images.generate({
    model,
    prompt,
    size: "1024x1024",
  });

  const imageBase64 = response.data?.[0]?.b64_json;
  const imageUrl = response.data?.[0]?.url;
  if (!imageBase64 && !imageUrl) throw new Error("Image generation returned no image.");

  return {
    imageUrl: imageBase64 ? `data:image/png;base64,${imageBase64}` : imageUrl!,
    source: "generated",
  };
}
