import { NextResponse } from "next/server";
import { fallbackFoodOrderName } from "@/lib/orderName";

type Body = {
  restaurantName?: string;
  itemNames?: string[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const restaurantName = (body.restaurantName ?? "").trim();
    const itemNames = Array.isArray(body.itemNames)
      ? body.itemNames.map((x) => String(x || "").trim()).filter(Boolean)
      : [];

    if (itemNames.length === 0) {
      return NextResponse.json({ ok: true, name: "Food order" });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: true, name: fallbackFoodOrderName(itemNames) });
    }

    const prompt = [
      "Create a short ecommerce food order title.",
      "Rules:",
      "- return only one line plain text",
      "- max 7 words",
      "- no punctuation at the end",
      "- no emojis",
      "- include the main food names naturally",
      restaurantName ? `Restaurant: ${restaurantName}` : "",
      `Items: ${itemNames.join(", ")}`,
      "Example style: Rice and Chicken Plate",
    ]
      .filter(Boolean)
      .join("\n");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 24,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const json = (await response.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    const aiText = (json?.choices?.[0]?.message?.content ?? "").trim();
    const name = aiText
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);

    if (!name) {
      return NextResponse.json({ ok: true, name: fallbackFoodOrderName(itemNames) });
    }

    return NextResponse.json({ ok: true, name });
  } catch {
    return NextResponse.json({ ok: true, name: "Food order" });
  }
}
