import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createWalletPinHash, isValidWalletPin } from "@/lib/walletPin";
import { hashWalletOtp, isValidWalletOtp } from "@/lib/walletOtp";

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

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { otp?: string; newPin?: string; confirmPin?: string } | null;
    const otp = String(body?.otp ?? "").trim();
    const newPin = String(body?.newPin ?? "").trim();
    const confirmPin = String(body?.confirmPin ?? "").trim();

    if (!isValidWalletOtp(otp)) {
      return NextResponse.json({ ok: false, error: "Enter the 6-digit OTP sent to your email." }, { status: 400 });
    }
    if (!isValidWalletPin(newPin)) {
      return NextResponse.json({ ok: false, error: "Wallet PIN must be exactly 4 digits." }, { status: 400 });
    }
    if (newPin !== confirmPin) {
      return NextResponse.json({ ok: false, error: "PIN confirmation does not match." }, { status: 400 });
    }

    const a = adminClient();
    const { data: otpRow, error: otpErr } = await a
      .from("wallet_security_otps")
      .select("id,code_hash,expires_at,consumed_at")
      .eq("user_id", authData.user.id)
      .eq("purpose", "pin_reset")
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; code_hash: string; expires_at: string; consumed_at: string | null }>();

    if (otpErr) return NextResponse.json({ ok: false, error: otpErr.message }, { status: 500 });
    if (!otpRow) return NextResponse.json({ ok: false, error: "Request a new OTP to reset your wallet PIN." }, { status: 400 });
    if (new Date(otpRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: "This OTP has expired. Request another one." }, { status: 400 });
    }
    if (otpRow.code_hash !== hashWalletOtp(otp)) {
      return NextResponse.json({ ok: false, error: "The OTP you entered is incorrect." }, { status: 400 });
    }

    const next = createWalletPinHash(newPin);
    const { error: updateErr } = await a
      .from("profiles")
      .update({
        wallet_pin_hash: next.hash,
        wallet_pin_salt: next.salt,
        wallet_pin_enabled: true,
      })
      .eq("id", authData.user.id);
    if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

    await a.from("wallet_security_otps").update({ consumed_at: new Date().toISOString() }).eq("id", otpRow.id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
