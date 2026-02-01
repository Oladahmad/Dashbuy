import { NextResponse } from "next/server";

type Body = {
  email: string;
  amountKobo: number;
  reference?: string;
  callbackUrl: string;
  metadata?: unknown;
};

function asText(x: unknown) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function asNumber(x: unknown) {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function genRef() {
  return `dashbuy_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Body>;

    const email = asText(body.email).trim();
    const amountKobo = asNumber(body.amountKobo);
    const callbackUrl = asText(body.callbackUrl).trim();
    const reference = asText(body.reference).trim() || genRef();

    if (!email || !amountKobo || !callbackUrl) {
      return NextResponse.json({ ok: false, error: "Missing email, amountKobo, or callbackUrl" }, { status: 400 });
    }

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "PAYSTACK_SECRET_KEY missing in env" }, { status: 500 });
    }

    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        reference,
        callback_url: callbackUrl,
        metadata: body.metadata ?? null,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data?.status) {
      return NextResponse.json(
        { ok: false, error: data?.message ?? "Paystack init failed", raw: data },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      authorization_url: data.data.authorization_url,
      reference,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
