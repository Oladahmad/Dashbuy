import { NextResponse } from "next/server";

type ReqBody = {
  name?: string;
  category?: string;
  price?: number | string;
  stockQty?: number | string;
  imageUrl?: string;
  imageDataUrl?: string;
};

function clean(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function toNumber(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isLikelyDataImage(v: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(v);
}

function parseDataImage(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function extractText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const obj = json as Record<string, unknown>;
  const choices = obj.choices;
  if (!Array.isArray(choices)) return "";

  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object") continue;
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string" && content.trim()) return content.trim();
  }

  return "";
}

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing GROQ_API_KEY on server." },
      { status: 500 }
    );
  }

  let body: ReqBody;
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = clean(body.name);
  const category = clean(body.category);
  const price = toNumber(body.price);
  const stockQty = toNumber(body.stockQty);
  const imageUrl = clean(body.imageUrl);
  const imageDataUrl = clean(body.imageDataUrl);

  if (!name) {
    return NextResponse.json({ ok: false, error: "Product name is required" }, { status: 400 });
  }

  const details = [
    `Product name: ${name}`,
    `Category: ${category || "Others"}`,
    `Price: ${price !== null ? price : "Not provided"}`,
    `Stock quantity: ${stockQty !== null ? stockQty : "Not provided"}`,
  ].join("\n");

  const prompt = [
    "Write a clear ecommerce product description for Nigerian buyers.",
    "Rules:",
    "- Write only 1 short paragraph, maximum 55 words.",
    "- Plain, simple, trustworthy language.",
    "- Mention key use, benefit and who it is for.",
    "- No fake claims, no emojis, no markdown.",
    "- Keep it natural and seller-friendly.",
    "- After the paragraph, add 2 or 3 short bullet-style feature lines starting with a dash.",
    "- Keep only key selling points. Do not over-explain.",
    "",
    details,
    imageUrl ? `Image reference URL: ${imageUrl}` : "",
    imageDataUrl && isLikelyDataImage(imageDataUrl)
      ? "An image was provided by the seller, but only use it as loose context if details already support it."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const parsedImage = imageDataUrl && isLikelyDataImage(imageDataUrl) ? parseDataImage(imageDataUrl) : null;
  const imageHint = parsedImage ? "\nSeller also uploaded a product image for visual context." : "";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 260,
      messages: [
        {
          role: "system",
          content:
            "You write short, trustworthy ecommerce product descriptions for Nigerian marketplaces. Keep them concise, useful, and conversion-focused without exaggeration.",
        },
        {
          role: "user",
          content: `${prompt}${imageHint}`,
        },
      ],
    }),
  });

  const json = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const err =
      (json && typeof json === "object" && (json as Record<string, unknown>).error
        ? JSON.stringify((json as Record<string, unknown>).error)
        : "AI request failed");
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }

  const description = extractText(json);
  if (!description) {
    return NextResponse.json({ ok: false, error: "No description returned from AI" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, description });
}
