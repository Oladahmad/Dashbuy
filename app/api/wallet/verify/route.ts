import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { creditWalletFromPaystack } from "@/lib/walletCredit";

type Body = { reference?: string };

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

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as Body | null;
    const reference = String(body?.reference ?? "").trim();
    if (!reference) return NextResponse.json({ ok: false, error: "Missing reference" }, { status: 400 });

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "PAYSTACK_SECRET_KEY missing in env" }, { status: 500 });
    }

    const res = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const data = await res.json();
    if (!data?.status) {
      return NextResponse.json({ ok: false, error: data?.message ?? "Verify failed" }, { status: 400 });
    }

    const status = String(data?.data?.status ?? "");
    if (status !== "success") {
      return NextResponse.json({ ok: true, status });
    }

    const meta = data?.data?.metadata || {};
    const type = String(meta?.type ?? "");
    const customerId = String(meta?.customerId ?? "");
    const amountKobo = Number(data?.data?.amount ?? 0);
    const amount = Math.floor(amountKobo / 100);

    if (type !== "wallet_topup" || !customerId) {
      return NextResponse.json({ ok: false, error: "Invalid wallet topup metadata" }, { status: 400 });
    }

    const result = await creditWalletFromPaystack({
      customerId,
      amount,
      reference,
    });

    return NextResponse.json({ ok: result.ok, status: "success", credited: true, already: result.already ?? false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

