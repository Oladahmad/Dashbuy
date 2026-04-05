import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { creditWalletTransaction } from "@/lib/walletCredit";
import { squadVerifyTransaction } from "@/lib/squad";

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

    const secret = process.env.SQUAD_SECRET_KEY;
    if (!secret) {
      return NextResponse.json({ ok: false, error: "SQUAD_SECRET_KEY missing in env" }, { status: 500 });
    }

    const verification = await squadVerifyTransaction(reference);
    const data = verification.json;
    if (!verification.ok || !data?.success) {
      return NextResponse.json({ ok: false, error: data?.message ?? "Verify failed" }, { status: 400 });
    }

    const status = String(data?.data?.transaction_status ?? "").trim().toLowerCase();
    if (status !== "success" && status !== "successful") {
      return NextResponse.json({ ok: true, status: data?.data?.transaction_status ?? status });
    }

    const txRef = String(data?.data?.transaction_ref ?? reference);
    const amountKobo = Number(data?.data?.transaction_amount ?? 0);
    const amount = Math.floor(amountKobo / 100);
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: txRow, error: txErr } = await admin
      .from("wallet_transactions")
      .select("customer_id,type")
      .eq("reference", txRef)
      .maybeSingle<{ customer_id: string; type: string | null }>();
    if (txErr) {
      return NextResponse.json({ ok: false, error: txErr.message }, { status: 500 });
    }
    const customerId = String(txRow?.customer_id ?? "");
    const type = String(txRow?.type ?? "");
    if (type !== "topup" || !customerId) {
      return NextResponse.json({ ok: false, error: "Wallet transaction not found for this payment." }, { status: 404 });
    }

    const result = await creditWalletTransaction({
      customerId,
      amount,
      reference: txRef,
      provider: "squad",
    });

    return NextResponse.json({ ok: result.ok, status: "success", credited: true, already: result.already ?? false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
