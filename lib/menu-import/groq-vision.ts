import OpenAI from "openai";
import type { IngestedMenuUpload } from "./types";
import { cleanText } from "./utils";

const DEFAULT_GROQ_VISION_MODEL = process.env.GROQ_MENU_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

function getGroqVisionClient() {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) return null;

  return new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

function buildVisionPrompt(pageNumber: number, totalPages: number) {
  return [
    `You are reading page ${pageNumber} of ${totalPages} from a Nigerian restaurant menu.`,
    "Extract the visible menu text as clean plain text for OCR recovery.",
    "Preserve menu headings, column sections, item names, bullet points, and every visible price.",
    "Keep one menu item per line whenever possible, especially for price lists.",
    "If a section contains item names without prices, still output each item on its own line.",
    "Do not merge neighboring columns into one sentence.",
    "Do not summarize, explain, or add missing details.",
    "If a line is unclear, return your best reading instead of skipping it.",
    "Output only the extracted text.",
  ].join(" ");
}

export async function extractMenuTextWithGroqVision(upload: IngestedMenuUpload) {
  if (upload.pageImages.length === 0) return "";

  const client = getGroqVisionClient();
  if (!client) return "";

  const pages: string[] = [];
  for (const [index, image] of upload.pageImages.entries()) {
    const response = await client.chat.completions.create({
      model: DEFAULT_GROQ_VISION_MODEL,
      temperature: 0.2,
      max_completion_tokens: 1800,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildVisionPrompt(index + 1, upload.pageImages.length),
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mimeType};base64,${image.buffer.toString("base64")}`,
              },
            },
          ],
        },
      ],
    });

    const text = cleanText(response.choices[0]?.message?.content ?? "");
    if (text) pages.push(text);
  }

  return cleanText(pages.join("\n"));
}
