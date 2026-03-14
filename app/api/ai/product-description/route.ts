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

function extractText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const obj = json as Record<string, unknown>;

  const outputText = obj.output_text;
  if (typeof outputText === "string" && outputText.trim()) return outputText.trim();

  const output = obj.output;
  if (!Array.isArray(output)) return "";

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;

    for (const c of content) {
      if (!c || typeof c !== "object") continue;
      const text = (c as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) return text.trim();
    }
  }

  return "";
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing OPENAI_API_KEY on server." },
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

  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: [
        "Write a clear ecommerce product description for Nigerian buyers.",
        "Rules:",
        "- 2 short paragraphs.",
        "- Plain, simple, trustworthy language.",
        "- Mention key use/benefit and who it is for.",
        "- No fake claims, no emojis, no markdown.",
        "",
        details,
      ].join("\n"),
    },
  ];

  if (imageDataUrl && isLikelyDataImage(imageDataUrl)) {
    content.push({ type: "input_image", image_url: imageDataUrl });
  } else if (imageUrl) {
    content.push({ type: "input_image", image_url: imageUrl });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      max_output_tokens: 220,
      input: [
        {
          role: "user",
          content,
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
