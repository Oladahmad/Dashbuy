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

  const candidates = obj.candidates;
  if (!Array.isArray(candidates)) return "";

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }

  return "";
}

export async function POST(req: Request) {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "";
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing GEMINI_API_KEY on server." },
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
    "- 2 short paragraphs.",
    "- Plain, simple, trustworthy language.",
    "- Mention key use, benefit and who it is for.",
    "- No fake claims, no emojis, no markdown.",
    "- Keep it natural and seller-friendly.",
    "",
    details,
    imageUrl ? `Image URL reference: ${imageUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (imageDataUrl && isLikelyDataImage(imageDataUrl)) {
    const parsed = parseDataImage(imageDataUrl);
    if (parsed) {
      parts.push({
        inline_data: {
          mime_type: parsed.mimeType,
          data: parsed.data,
        },
      });
    }
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts,
        },
      ],
      generationConfig: {
        maxOutputTokens: 220,
        temperature: 0.7,
      },
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
