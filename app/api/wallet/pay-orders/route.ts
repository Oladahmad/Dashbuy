import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyOrderEvent } from "@/lib/orderNotifications";
import { verifyWalletPin, isValidWalletPin } from "@/lib/walletPin";
import { HIGH_VALUE_WALLET_OTP_THRESHOLD, hashWalletOtp, isValidWalletOtp } from "@/lib/walletOtp";

type Body = { orderIds?: string[]; pin?: string; otp?: string };

type OrderRow = {
  id: string;
  status: string | null;
  customer_id: string;
  vendor_id: string;
  order_type: string | null;
  total: number | null;
  total_amount: number | null;
  food_mode: string | null;
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

function safeNumber(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const orderIds = Array.isArray(body?.orderIds) ? body!.orderIds.map((x) => String(x).trim()).filter(Boolean) : [];
    const pin = String(body?.pin ?? "").trim();
    const otp = String(body?.otp ?? "").trim();
    if (orderIds.length === 0) return NextResponse.json({ ok: false, error: "Missing orderIds" }, { status: 400 });

    const token = readBearerToken(req);
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 401 });

    const anon = anonClient();
    const { data: authData, error: authErr } = await anon.auth.getUser(token);
    if (authErr || !authData.user) return NextResponse.json({ ok: false, error: "Invalid session" }, { status: 401 });
    const customerId = authData.user.id;

    const a = adminClient();
    const { data: profile, error: profileErr } = await a
      .from("profiles")
      .select("wallet_pin_hash,wallet_pin_salt,wallet_pin_enabled")
      .eq("id", customerId)
      .maybeSingle<{ wallet_pin_hash: string | null; wallet_pin_salt: string | null; wallet_pin_enabled: boolean | null }>();
    if (profileErr) return NextResponse.json({ ok: false, error: profileErr.message }, { status: 500 });
    if (!profile?.wallet_pin_enabled) {
      return NextResponse.json({ ok: false, error: "Set your wallet PIN first in Account before paying with wallet." }, { status: 400 });
    }
    if (!isValidWalletPin(pin)) {
      return NextResponse.json({ ok: false, error: "Enter your 4-digit wallet PIN to continue." }, { status: 400 });
    }
    const validPin = verifyWalletPin(pin, profile.wallet_pin_hash ?? "", profile.wallet_pin_salt ?? "");
    if (!validPin) {
      return NextResponse.json({ ok: false, error: "Wallet PIN is incorrect." }, { status: 400 });
    }

    const { data: orders, error: ordersErr } = await a
      .from("orders")
      .select("id,status,customer_id,vendor_id,order_type,total,total_amount,food_mode")
      .in("id", orderIds);
    if (ordersErr) return NextResponse.json({ ok: false, error: ordersErr.message }, { status: 500 });

    const rows = (orders as OrderRow[] | null) ?? [];
    if (rows.length !== orderIds.length) {
      return NextResponse.json({ ok: false, error: "One or more orders not found" }, { status: 404 });
    }

    const invalidOwner = rows.find((o) => o.customer_id !== customerId);
    if (invalidOwner) return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });

    const invalidStatus = rows.find((o) => String(o.status ?? "") !== "pending_payment");
    if (invalidStatus) {
      return NextResponse.json({ ok: false, error: "One or more orders are not pending payment" }, { status: 400 });
    }

    const { data: wallet } = await a
      .from("customer_wallets")
      .select("balance")
      .eq("customer_id", customerId)
      .maybeSingle<{ balance: number | null }>();
    const balance = safeNumber(wallet?.balance ?? 0);
    const total = rows.reduce((sum, o) => sum + safeNumber(o.total ?? o.total_amount ?? 0), 0);
    if (total <= 0) return NextResponse.json({ ok: false, error: "Invalid order total" }, { status: 400 });

    if (balance < total) {
      return NextResponse.json({ ok: false, error: "Insufficient wallet balance" }, { status: 400 });
    }

    if (total >= HIGH_VALUE_WALLET_OTP_THRESHOLD) {
      if (!isValidWalletOtp(otp)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Enter the 6-digit email OTP to approve this high-value wallet payment.",
            otpRequired: true,
          },
          { status: 400 }
        );
      }

      const { data: otpRow, error: otpErr } = await a
        .from("wallet_security_otps")
        .select("id,code_hash,expires_at,amount")
        .eq("user_id", customerId)
        .eq("purpose", "wallet_payment")
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; code_hash: string; expires_at: string; amount: number | null }>();

      if (otpErr) return NextResponse.json({ ok: false, error: otpErr.message }, { status: 500 });
      if (!otpRow) {
        return NextResponse.json(
          {
            ok: false,
            error: "Request a wallet payment OTP and try again.",
            otpRequired: true,
          },
          { status: 400 }
        );
      }
      if (new Date(otpRow.expires_at).getTime() < Date.now()) {
        return NextResponse.json(
          {
            ok: false,
            error: "This wallet payment OTP has expired. Request another one.",
            otpRequired: true,
          },
          { status: 400 }
        );
      }
      if (safeNumber(otpRow.amount) !== Math.round(total)) {
        return NextResponse.json(
          {
            ok: false,
            error: "This OTP was generated for a different wallet payment amount. Request a fresh OTP.",
            otpRequired: true,
          },
          { status: 400 }
        );
      }
      if (otpRow.code_hash !== hashWalletOtp(otp)) {
        return NextResponse.json(
          {
            ok: false,
            error: "The wallet payment OTP is incorrect.",
            otpRequired: true,
          },
          { status: 400 }
        );
      }

      await a
        .from("wallet_security_otps")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", otpRow.id);
    }

    const ref = `wallet_${customerId.slice(0, 8)}_${Date.now()}`;
    const nextBalance = balance - total;
    await a.from("customer_wallets").upsert({ customer_id: customerId, balance: nextBalance }, { onConflict: "customer_id" });

    await a.from("wallet_transactions").insert({
      customer_id: customerId,
      amount: total,
      reference: ref,
      provider: "wallet",
      type: "payment",
      status: "success",
    });

    await a
      .from("orders")
      .update({ status: "pending_vendor", paystack_reference: ref })
      .in("id", orderIds);

    await Promise.allSettled(
      rows.map((order) =>
        notifyOrderEvent({
          event: "order_paid",
          orderId: order.id,
          vendorId: order.vendor_id,
          customerId: order.customer_id,
          amountNaira: order.total_amount ?? order.total,
          orderType: order.order_type,
        })
      )
    );

    return NextResponse.json({ ok: true, balance: nextBalance, reference: ref });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
