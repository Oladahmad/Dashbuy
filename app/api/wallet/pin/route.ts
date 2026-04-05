import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createWalletPinHash, isValidWalletPin, verifyWalletPin } from "@/lib/walletPin";

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

async function resolveUser(req: Request) {
  const token = readBearerToken(req);
  if (!token) return { error: NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 }) };

  const anon = anonClient();
  const { data: authData, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !authData.user) {
    return { error: NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 }) };
  }
  return { userId: authData.user.id };
}

export async function GET(req: Request) {
  try {
    const resolved = await resolveUser(req);
    if (resolved.error) return resolved.error;

    const a = adminClient();
    const { data, error } = await a
      .from("profiles")
      .select("wallet_pin_enabled")
      .eq("id", resolved.userId)
      .maybeSingle<{ wallet_pin_enabled: boolean | null }>();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, enabled: !!data?.wallet_pin_enabled });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const resolved = await resolveUser(req);
    if (resolved.error) return resolved.error;

    const body = (await req.json().catch(() => null)) as
      | { currentPin?: string; newPin?: string; confirmPin?: string }
      | null;

    const currentPin = String(body?.currentPin ?? "").trim();
    const newPin = String(body?.newPin ?? "").trim();
    const confirmPin = String(body?.confirmPin ?? "").trim();

    if (!isValidWalletPin(newPin)) {
      return NextResponse.json({ ok: false, error: "Wallet PIN must be exactly 4 digits." }, { status: 400 });
    }
    if (newPin !== confirmPin) {
      return NextResponse.json({ ok: false, error: "PIN confirmation does not match." }, { status: 400 });
    }

    const a = adminClient();
    const { data: profile, error: profileErr } = await a
      .from("profiles")
      .select("wallet_pin_hash,wallet_pin_salt,wallet_pin_enabled")
      .eq("id", resolved.userId)
      .maybeSingle<{ wallet_pin_hash: string | null; wallet_pin_salt: string | null; wallet_pin_enabled: boolean | null }>();

    if (profileErr) return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });

    if (profile?.wallet_pin_enabled) {
      if (!isValidWalletPin(currentPin)) {
        return NextResponse.json({ ok: false, error: "Enter your current 4-digit wallet PIN." }, { status: 400 });
      }
      const validCurrent = verifyWalletPin(currentPin, profile.wallet_pin_hash ?? "", profile.wallet_pin_salt ?? "");
      if (!validCurrent) {
        return NextResponse.json({ ok: false, error: "Current wallet PIN is incorrect." }, { status: 400 });
      }
    }

    const next = createWalletPinHash(newPin);
    const { error: updateErr } = await a
      .from("profiles")
      .update({
        wallet_pin_hash: next.hash,
        wallet_pin_salt: next.salt,
        wallet_pin_enabled: true,
      })
      .eq("id", resolved.userId);

    if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, enabled: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
