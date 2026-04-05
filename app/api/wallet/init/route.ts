import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { squadInitiatePayment } from "@/lib/squad";

type Body = {
  amount?: number | string;
  email?: string;
};

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function anonClient() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
}

function readBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const [scheme, token] = h.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) return token.trim();
  return "";
}

function asText(x: unknown) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function trimTrailingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const customerId = authData.user.id;
    const body = (await req.json().catch(() => null)) as Body | null;
    const amount = Math.floor(Number(body?.amount ?? 0));
    const email = asText(body?.email ?? "").trim() || authData.user.email || "";

    if (!email) return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "Enter a valid amount" }, { status: 400 });
    }

    const secret = process.env.SQUAD_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "SQUAD_SECRET_KEY missing in env" }, { status: 500 });
    }

    const envBase = asText(process.env.NEXT_PUBLIC_SITE_URL).trim();
    const xfProto = asText(req.headers.get("x-forwarded-proto")).trim() || "https";
    const xfHost = asText(req.headers.get("x-forwarded-host")).trim();
    const host = xfHost || asText(req.headers.get("host")).trim();
    const inferredBase = host ? `${xfProto}://${host}` : "";
    const baseUrl = trimTrailingSlash(envBase || inferredBase);
    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: "Unable to resolve base URL. Set NEXT_PUBLIC_SITE_URL in env." },
        { status: 500 }
      );
    }

    const reference = `dashbuy_wallet_${customerId.slice(0, 8)}_${Date.now()}`;
    const callbackUrl = `${baseUrl}/account/add-funds/callback`;

    const squad = await squadInitiatePayment({
      amountKobo: Math.round(Number(amount) * 100),
      email,
      transactionRef: reference,
      callbackUrl,
      metadata: {
        type: "wallet_topup",
        customerId,
      },
      paymentChannels: ["card", "bank", "transfer", "ussd"],
    });
    const json = squad.json;
    if (!squad.ok || !json?.data?.checkout_url) {
      return NextResponse.json(
        { ok: false, error: json?.message ?? "Wallet payment init failed", raw: json },
        { status: 400 }
      );
    }

    const a = adminClient();
    await a.from("wallet_transactions").insert({
      customer_id: customerId,
      amount,
      reference,
      provider: "squad",
      type: "topup",
      status: "initialized",
    });

    return NextResponse.json({ ok: true, authorization_url: json.data.checkout_url, reference });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
