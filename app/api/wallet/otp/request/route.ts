import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateWalletOtp, hashWalletOtp } from "@/lib/walletOtp";
import { sendTransactionalEmail, simpleEmailLayout } from "@/lib/mailer";

type Body = {
  purpose?: "pin_reset" | "wallet_payment";
  amount?: number;
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

export async function POST(req: Request) {
  try {
    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as Body | null;
    const purpose = body?.purpose === "pin_reset" ? "pin_reset" : "wallet_payment";
    const amount = Math.max(0, Math.round(Number(body?.amount ?? 0)));
    const email = authData.user.email?.trim() ?? "";
    if (!email) return NextResponse.json({ ok: false, error: "No email found for this account." }, { status: 400 });

    const code = generateWalletOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const a = adminClient();
    await a
      .from("wallet_security_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", authData.user.id)
      .eq("purpose", purpose)
      .is("consumed_at", null);

    const { error: insertErr } = await a.from("wallet_security_otps").insert({
      user_id: authData.user.id,
      purpose,
      amount: purpose === "wallet_payment" ? amount : null,
      code_hash: hashWalletOtp(code),
      expires_at: expiresAt,
    });
    if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });

    const bodyHtml =
      purpose === "pin_reset"
        ? `<p>Use this OTP to reset your Dashbuy wallet PIN:</p><p style="font-size:28px;font-weight:700;letter-spacing:0.2em;margin:16px 0;">${code}</p><p>This code will expire in 10 minutes.</p>`
        : `<p>Use this OTP to approve your wallet payment${amount > 0 ? ` of N${amount.toLocaleString()}` : ""}:</p><p style="font-size:28px;font-weight:700;letter-spacing:0.2em;margin:16px 0;">${code}</p><p>This code will expire in 10 minutes.</p>`;

    await sendTransactionalEmail(
      email,
      purpose === "pin_reset" ? "Reset your Dashbuy wallet PIN" : "Approve your Dashbuy wallet payment",
      simpleEmailLayout(purpose === "pin_reset" ? "Wallet PIN reset OTP" : "Wallet payment OTP", bodyHtml)
    );

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
